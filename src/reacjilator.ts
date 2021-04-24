import { ConversationsRepliesResponse, Message, Permalink, UserProfileResponse } from './types/conversations-replies';
import { ReactionAddedEvent } from './types/reaction-added';
import { reactionToLang } from './languages';
import { WebClient } from '@slack/web-api';
import { AsyncRedisClient } from "@mjplabs/redis-async";

export function lang(event: ReactionAddedEvent): string | null {
  console.log(event);
  const reactionName = event.reaction;
  if (reactionName.match(/flag-/)) { // flag-***
    const matched = reactionName.match(/(?!flag-\b)\b\w+/);
    if (matched != null) {
      const country = matched[0];
      return reactionToLang[country];
    }
  } else { // jp, fr, etc.
    return reactionToLang[reactionName];
  }
  return null;
}

export async function repliesInThread(client: WebClient, channel: string, ts: string): Promise<ConversationsRepliesResponse> {
  return await client.conversations.replies({
    channel,
    ts,
    inclusive: true
  }) as ConversationsRepliesResponse;
}

export async function isAlreadyTranslated(redisClient: AsyncRedisClient, channelId: string, messageTs: string, language: string): Promise<boolean> {
  return await redisClient.runSingle(c => c.sismember(`${channelId}:${messageTs}`, language)) == 1
}

export async function markAsTranslated(redisClient: AsyncRedisClient, channelId: string, messageTs: string, language: string): Promise<void> {
  const key = `${channelId}:${messageTs}`
  const week = 60 * 60 * 24 * 7
  await redisClient.runMultiple(c => c.sadd(key, language).expire(key, week))
}

export async function sayInThread(client: WebClient, channel: string, text: string, message: Message, alteredMessageText: string) {
  let footer = alteredMessageText.length > 50 ? `${alteredMessageText.substring(0, 49)}…` : alteredMessageText;

  if (message.user) {
    const { profile } = await client.users.profile.get({
      user: message.user
    }) as UserProfileResponse;

    if (profile?.real_name) {
      footer = `${footer}\nOriginally sent by: ${profile.real_name}`;
    }
  }

  if (message.ts) {
    const { permalink } = await client.chat.getPermalink({
      channel,
      message_ts: message.ts
    }) as Permalink;

    footer = `${footer}\n*<${permalink}|View original message>*`;
  }

  const translationBlock = {
    type: "section",
    text: {
      type: "mrkdwn",
      text
    },
    accessory: {
      type: "overflow",
      confirm: {
        title: {
          type: "plain_text",
          text: "Are you sure?"
        },
        text: {
          type: "mrkdwn",
          text: "Are you sure you want to delete this translation? 🗑️"
        },
        confirm: {
          type: "plain_text",
          text: "Do it!"
        },
        deny: {
          type: "plain_text",
          text: "Stop, I've changed my mind!"
        }
      },
      options: [
        {
          text: {
            type: "plain_text",
            text: "Delete this translation"
          },
          value: "delete"
        }
      ],
      action_id: "overflow"
    }
  }

  const footerBlock = {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: footer
      }
    ]
  }

  try {
    await client.chat.postMessage({
      channel,
      text,
      blocks: [translationBlock, footerBlock],
      thread_ts: message.thread_ts ? message.thread_ts : message.ts
    });
  } catch {
    await client.chat.postMessage({
      channel,
      text: "I’m terribly sorry, but I was unable to post the translation. It was likely too long for Slack to handle.",
      thread_ts: message.thread_ts ? message.thread_ts : message.ts
    })
  }
}
