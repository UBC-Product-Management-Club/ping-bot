import cron from "node-cron";
import { app } from "./index.js";
import { cache } from "./cache.js";
import { format, formatInTimeZone } from "date-fns-tz";
import { differenceInYears, parse } from "date-fns";

const TIME_ZONE = "America/Los_Angeles"; // PST

/**
 * Checks current date with list of birthdays and sends a message if a birthday is found
 * @returns {Promise<void>} request to https://api.slack.com/methods/chat.postMessage
 */
const checkBirthdaysAndSendMessage = async () => {
  if (!cache.members || !cache.members.length) {
    return;
  }

  const nowPST = formatInTimeZone(new Date(), TIME_ZONE, "yyyy-MM-dd");
  const todayMonthDayPST = format(nowPST, "MM/dd", { timeZone: TIME_ZONE });

  for (const person of cache.members) {
    try {
      if (!person.birthday) continue;

      const birthDate = parse(person.birthday, "yyyy-MM-dd", new Date());
      let parsedDate = birthDate;
      if (isNaN(parsedDate)) {
        parsedDate = parse(person.birthday, "MM/dd/yyyy", new Date());
      }
      if (isNaN(parsedDate)) continue;

      const personBirthdayMonthDay = format(parsedDate, "MM/dd");

      if (personBirthdayMonthDay === todayMonthDayPST) {
        const age = differenceInYears(new Date(), parsedDate);
        let suffix;
        switch (age % 10) {
          case 1:
            suffix = "st";
            break;
          case 2:
            suffix = "nd";
            break;
          case 3:
            suffix = "rd";
            break;
          default:
            suffix = "th";
        }
        const message = `Today is <@${person.slack_user_id}>'s ${age}${suffix} birthday! Wish them a happy birthday 🎉`;

        await app.client.chat.postMessage({
          token: process.env.SLACK_BOT_TOKEN,
          channel: process.env.BIRTHDAY_CHANNEL_ID,
          text: message,
        });
      }
    } catch (error) {
      console.error(`Error processing birthday for ${person.name}: `, error);
    }
  }
};

// Scheduled to run every day at 9:00 AM PST
cron.schedule(
  "0 9 * * *",
  () => {
    checkBirthdaysAndSendMessage();
  },
  {
    scheduled: true,
    timezone: TIME_ZONE,
  },
);
