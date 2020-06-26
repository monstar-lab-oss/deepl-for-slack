import { loadEnv } from './dotenv';
loadEnv();

import { App } from '@slack/bolt';
import { ConsoleLogger, LogLevel } from '@slack/logger';
import * as middleware from './custom-middleware';

import { DeepLApi } from './deepl';
import * as runner from './runnner';
import * as reacjilator from './reacjilator';


const logLevel = process.env.SLACK_LOG_LEVEL as LogLevel || LogLevel.INFO;
const logger = new ConsoleLogger();
logger.setLevel(logLevel);

const deepLAuthKey = process.env.DEEPL_AUTH_KEY;
if (!deepLAuthKey) {
  throw "DEEPL_AUTH_KEY is missing!";
}
const deepL = new DeepLApi(deepLAuthKey, logger);

const app = new App({
  logger,
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});
middleware.enableAll(app);

// -----------------------------
// shortcut
// -----------------------------

app.shortcut("deepl-translation", async ({ ack, body, client }) => {
  await ack();
  await runner.openModal(client, body.trigger_id);
});

app.view("run-translation", async ({ ack, client, body }) => {
  const text = body.view.state.values.text.a.value;
  const lang = body.view.state.values.lang.a.selected_option.value;

  await ack({
    response_action: "update",
    view: runner.buildLoadingView(lang, text)
  });

  const translatedText: string | null = await deepL.translate(text, lang);

  await client.views.update({
    view_id: body.view.id,
    view: runner.buildResultView(lang, text, translatedText || ":x: Failed to translate it for some reason")
  });
});

app.view("new-runner", async ({ body, ack }) => {
  await ack({
    response_action: "update",
    view: runner.buildNewModal(body.view.private_metadata)
  })
})

// -----------------------------
// reacjilator
// -----------------------------

import { ReactionAddedEvent } from './types/reaction-added';
import { ActionResponse, ActionBodyResponse } from './types/actions';

app.event("reaction_added", async ({ body, client }) => {
  const event = body.event as ReactionAddedEvent;
  if (event.item['type'] !== 'message') {
    return;
  }
  const channelId = event.item['channel'];
  const messageTs = event.item['ts'];
  if (!channelId || !messageTs) {
    return;
  }
  const lang = reacjilator.lang(event);
  if (!lang) {
    return;
  }

  const replies = await reacjilator.repliesInThread(client, channelId, messageTs);
  if (replies.messages && replies.messages.length > 0) {
    const message = replies.messages[0];
    if (message.text) {
      const withoutUsernames = message.text
        .replace(/<@\S+>/gi, '👤')
        .replace(/<!\S+>/gi, '👥');
      const translatedText = await deepL.translate(withoutUsernames, lang);
      if (translatedText == null) {
        return;
      }
      if (reacjilator.isAlreadyPosted(replies, translatedText)) {
        return;
      }
      await reacjilator.sayInThread(client, channelId, translatedText, message);
    }
  }
});

app.action("overflow", async ({ ack, action, body, client }) => {
  const { selected_option } = action as ActionResponse;
  const { container, user } = body as ActionBodyResponse;

  await ack();

  if (selected_option?.value === "delete" && container?.channel_id && container.message_ts && container.thread_ts && user?.id) {
    await client.chat.delete({
      channel: container.channel_id,
      ts: container.message_ts
    });
    await client.chat.postEphemeral({
      channel: container.channel_id,
      user: user.id,
      text: "I deleted the translation. I hope that’s what you really wanted!",
      thread_ts: container.thread_ts
    });
  }
});

// -----------------------------
// starting the app
// -----------------------------

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})();

