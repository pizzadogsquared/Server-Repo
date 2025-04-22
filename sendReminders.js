import { Knock } from "@knocklabs/node";
import nodeSchedule from "node-schedule";
import db from "./db.js";

const knock = new Knock(process.env.KNOCK_API_KEY);

// send the email using knock
const sendEmail = async (email, name) => {
  try {
    // trigger the reminder workflow and email
    await knock.workflows.trigger("reminder", {
      recipients: [{ id: email, email }],
      data: {
        subject: "Bee Balanced Reminder",
        body: "This is your Bee Balanced check-in reminder!",
        date: new Date().toLocaleDateString(),
        name,
      },
    });
  } catch (err) {
    // catch any errors with sending emails
    console.error(`Failed to send email to ${email}`, err.message);
  }
};

// anchor date to check for every three days
const anchorDate = new Date("2025-01-01");

const scheduleReminderJob = () => {
  // email at 12pm
  nodeSchedule.scheduleJob("0 12 * * *", async () => {
    const today = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;

    // check if its been three days
    const daysSinceAnchor = Math.floor((today - anchorDate) / msPerDay);
    if (daysSinceAnchor % 3 === 0) {

      try {
        const [users] = await db.query("SELECT email, full_name FROM users");
        const promises = users
          .filter(user => user.email)
          .map(user => sendEmail(user.email, user.full_name));
        await Promise.all(promises);
      } catch (err) {
        console.error("Failed to send emails:", err.message);
      }
    }
  });
};

export { scheduleReminderJob };
