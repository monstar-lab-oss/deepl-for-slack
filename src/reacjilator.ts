import { ConversationsRepliesResponse, Message, Permalink, UserProfileResponse } from './types/conversations-replies';
import { ReactionAddedEvent } from './types/reaction-added';
import { reactionToLang } from './languages';
import { WebClient } from '@slack/web-api';

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

export function isAlreadyPosted(replies: ConversationsRepliesResponse, translatedText: string): boolean {
  if (!replies.messages) {
    return false;
  }
  for (const messageInThread of replies.messages) {
    if (messageInThread.text && messageInThread.text === translatedText) {
      return true;
    }
  }
  return false;
}

export async function sayInThread(client: WebClient, channel: string, text: string, message: Message) {
  const originalMessage = message.text;
  const trimmedMessage = originalMessage && originalMessage.length > 50 ? `${originalMessage.substring(0, 49)}…` : originalMessage;
  let footer = trimmedMessage;

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

  return await client.chat.postMessage({
    channel,
    text,
    blocks: [translationBlock, footerBlock],
    thread_ts: message.thread_ts ? message.thread_ts : message.ts
  });
}
