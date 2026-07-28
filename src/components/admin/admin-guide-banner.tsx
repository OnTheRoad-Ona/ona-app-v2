"use client";

import { useState } from "react";

type GuideEntry = {
  what: string;
  how: string;
  use: string;
};

const GUIDES: Record<string, GuideEntry> = {
  dashboard: {
    what: "This is the main screen you see when you open the admin panel. It shows you everything happening on Ona right now — how many people signed up, how many jobs are open, and if anything needs your attention.",
    how: "The page automatically loads numbers and a live board. Cards at the top show totals. The board below shows jobs grouped by status (Requested, Matched, In Progress, etc.). You can search for any person or job using the search bar.",
    use: "Look at the cards to see the big picture. Click a job on the board to act on it. Use the search bar to find a specific customer or job. The backup button at the bottom lets you save a copy of the database.",
  },
  jobs: {
    what: "This page lists every service job that people have requested on Ona. A job is when a customer asks for help (like car repair or towing) and a repair pro accepts it.",
    how: "The page fetches all jobs from the database and shows them in a table. You can see who requested the job, which pro is working on it, and what stage it's in. Each row has a dropdown to change the job status.",
    use: "Scan the table to find a job. Use the dropdown in the 'Update' column to move a job to the next stage (e.g., from 'matched' to 'accepted'). Only change status when you know what you're doing — it affects what both the customer and pro see.",
  },
  disputes: {
    what: "This page shows jobs where the customer and the repair pro are arguing — maybe the customer says the work wasn't done, or the pro says they weren't paid properly.",
    how: "Jobs in dispute or appeal appear here. Each row shows the job details and who is involved. You can decide what happens to the money by choosing: give it all to the pro, refund the customer fully, or split it between them.",
    use: "Read the job details carefully. Check messages and evidence. Pick an outcome (Full to Pro, Full refund, or Partial split) and enter the split percentages if needed. Click the action button to apply your decision. The money will move based on your choice.",
  },
  "payments-control": {
    what: "This is the money control room. Every time someone pays for a service on Ona, the money sits in a special holding account (called escrow). This page lets you see all that money and decide when to release it to the repair pro.",
    how: "The page has tabs: Payments (all transactions), Disputes, Audit (history of who did what), Failed payouts, and Commission report. You can filter payments by status — Held, Pending, Paid, Failed, Refunded, etc.",
    use: "Start on the Payments tab. Find a payment and click it to see details. From there you can release money to the pro (after the job is done), refund the customer (if the job wasn't done), or retry a failed payout. Sensitive actions need a temporary access code. Always write a note explaining why.",
  },
  "payments-manage": {
    what: "This is another way to see and control payments. It shows all payments in a list and lets you click each one to see who paid, who should get paid, and what's happening with the money.",
    how: "The page loads payments and shows stats cards (available balance, money in escrow, how many were paid out). Each payment can be selected to see more detail — customer info, pro bank details, and a history of transfer attempts.",
    use: "Use the filter buttons at the top to see payments in a specific status (All, Held, Pending, Released, etc.). Click a payment row to open the detail panel on the right. From there you can force a payout, refund a customer, or retry a failed transfer.",
  },
  "payment-detail": {
    what: "This page shows you everything about one single payment. Think of it as a magnifying glass — you can see who paid, who should receive the money, and exactly what state the money is in.",
    how: "The page loads the full payment record, including who the customer is, which repair pro is getting paid, the job it's for, and every attempt that was made to transfer the money. It also checks if there's a risk of paying twice.",
    use: "Review the details carefully. Use the buttons at the bottom to take action: 'Refund customer' to send money back, 'Force payout to pro' if the payment is stuck, or 'Stop processing' to pause things. Always write a note explaining why you're taking action.",
  },
  security: {
    what: "This is the Security Control page. It helps you keep Ona safe by monitoring user sessions, phone/email changes, fraud attempts, and every action admins take. Think of it as the security camera room for the app.",
    how: "The page has 4 sections. Overview shows counts of pending items. Contact Changes lets you approve or reject when someone wants to change their phone number or email. Fraud Review shows suspicious activity that might be someone trying to cheat the system. Audit Trail records every action every admin takes, so you can always see who did what.",
    use: "Check Overview first to see if anything needs attention. For contact changes, look at the details and click Approve (if it looks real) or Reject (if it looks suspicious). For fraud flags, investigate the user and mark as reviewed. The Audit Trail is a log you can check when something goes wrong.",
  },
  "credit-control": {
    what: "This is the Credit & Rewards Control page. It manages all the money-related parts of Ona — referral rewards, credit balances, cashout requests, and system settings. Think of it as the bank teller window.",
    how: "The page has 5 sections. Overview shows totals (rewards given, credits earned, pending cashouts). Referrals shows people who invited friends and are waiting for their reward. Credits shows every credit transaction and lets you manually adjust balances. Cashouts shows requests from people who want to turn their credits into real money. Settings controls how the system behaves (reward amounts, fees, minimums).",
    use: "Start with Overview to see the big picture. For referrals, approve legitimate invites and reject suspicious ones. For cashouts, verify the person's identity before clicking Approve, then Mark Paid once the money is sent. Use the Adjust Balance tool carefully — it adds or removes credits from a user's wallet. Never change settings without understanding what they do.",
  },
  customers: {
    what: "This page lists every customer on Ona. A customer is someone who requests services (like car repair or towing). You can find anyone who has ever signed up.",
    how: "The page has two tabs: Directory (all customers in a table) and ID Review (customers waiting for their identity to be checked). You can search by name, email, or phone. Click a customer row to open a detailed drawer with all their info.",
    use: "Use the Directory tab to browse all customers. Use the search box to find someone specific. Click a customer to see their full profile, ID documents, bank info, and job history. From the detail drawer you can approve their ID or freeze their account.",
  },
  "customer-detail": {
    what: "This page shows everything about one single customer — their name, contact info, ID documents, vehicle, bank details, job history, and more. It's like their complete file.",
    how: "The page loads all the customer's information from the database. It shows their profile, identity verification level, vehicle info, bank accounts, past jobs, bookings, payments, and reviews — all in one place.",
    use: "Use this to investigate a customer. Check if their ID is valid. See if their bank details look correct. Review their past jobs to see if there are any problems. You can approve their ID verification or freeze their account from here.",
  },
  pros: {
    what: "This page lists every Repair Pro on Ona — the mechanics, tow truck drivers, and other service people who fix cars and help customers. You can find any pro who has ever registered.",
    how: "The page has two tabs: Directory (all pros in a table) and Review (pros waiting for their documents to be checked). You can search by name, email, or phone. Click a pro row to open a detailed drawer with their full info, documents, and bank details.",
    use: "Use the Directory tab to see all pros. Use the search box to find a specific pro. Click a pro to see their full profile, ID documents, certifications, bank account, and job history. From the detail drawer you can approve their documents or suspend their account.",
  },
  users: {
    what: "This page shows every single person on Ona — customers, repair pros, and admin staff — all in one list. It's like the master phonebook of everyone who uses the app.",
    how: "The page loads all users from the database. You can search by name, email, or phone, and filter by role (Customer, Pro, Admin). Each row shows their role with a colored badge, and you can change their role or toggle their account active/inactive.",
    use: "Use the search box to find someone. Check what role they have. If someone needs a different role (like promoting a pro to admin), use the dropdown to change it. If someone is causing problems, you can deactivate their account to block them from using the app.",
  },
  verification: {
    what: "This is a quick dashboard that shows you how many people are waiting to have their identity verified. It's like a waiting room — you can see at a glance how many customers and pros need their IDs checked.",
    how: "The page shows stats cards: total customers, how many have pending IDs, total pros, how many pros have pending documents. Each card is a link that takes you directly to the detailed review page.",
    use: "Look at the numbers. If any are not zero, click the link to go review those people. For example, click 'Customer T2 pending' to go verify those customers' IDs. This helps keep the platform safe by making sure everyone is who they say they are.",
  },
  messages: {
    what: "This page shows all the conversations happening between customers and repair pros. It's like a big inbox where you can see what people are saying to each other about their jobs.",
    how: "The page has two columns: on the left, a list of conversations (each linked to a job); on the right, the messages for the selected conversation. You can read the full chat history for any job.",
    use: "Click a conversation on the left to read the messages on the right. This is useful when investigating disputes — you can see exactly what the customer and pro agreed on, what the customer said was wrong, and what the pro said they fixed.",
  },
  reviews: {
    what: "This page shows all the ratings and reviews that customers have left for repair pros after a job is done. It's like a report card for every pro.",
    how: "The page loads all reviews from the database and shows them in a table with the rating (stars), who wrote it, and what they said. You can scan through to spot anything unusual.",
    use: "Look through the reviews. If you see a suspicious review (maybe fake or abusive), you can investigate the customer and pro involved. This helps keep the marketplace fair and honest.",
  },
  signups: {
    what: "This page shows you everyone who has tried to create an account on Ona — whether they succeeded or failed. It's like watching the front door to see who's coming in.",
    how: "The page shows stats cards (total signups, how many succeeded, how many failed) and a table of recent signup events with details like the person's name, email, phone, and whether they succeeded or failed.",
    use: "Check the stats to see if there are many failed signups (might mean a technical problem). Look at individual signups to investigate suspicious activity — if someone keeps trying to sign up with different details, they might be up to no good.",
  },
  audit: {
    what: "This page is a log book. Every time an admin does something important — like approving a payment, changing someone's role, or freezing an account — it gets recorded here. It's like a security camera for admin actions.",
    how: "The page loads a list of audit events, each showing who did what, when, and what they changed. You can see the exact details of every action.",
    use: "Use this to check who did something. If a payment was released and nobody knows who did it, look here. If someone's role was changed unexpectedly, you can find out who changed it. Always check this when investigating problems.",
  },
  staff: {
    what: "This page controls who on your team can access what. There are 5 levels (L1 to L5). Level 1 can see basic things, Level 5 can do everything. It's like giving out different keys to different rooms.",
    how: "The page shows a guide explaining all 5 levels, then a table of staff members. For each person, you can select their access level from a dropdown. Changes take effect immediately.",
    use: "Think about what each person needs to do. Customer Care agents typically get L1-L2 (view jobs, verify IDs). Managers get L3-L4 (approve payments, change settings). Only give L5 (full access) to people who absolutely need it. Never give someone more access than they need.",
  },
  settings: {
    what: "This page lets you change how the Ona app works — things like the app name, support phone number, email address, and whether the app is in maintenance mode. Changes here affect the live app immediately.",
    how: "The page shows a form with fields for each setting. You can edit the values and save. The settings are stored in the database and the app reads them when it starts.",
    use: "Change the app name if it needs updating. Update the support phone or email if they've changed. Turn on maintenance mode if you need to stop people from using the app while you fix something. Always double-check your changes before saving.",
  },
  features: {
    what: "This page has switches that turn different parts of the app on or off — like signup, maps, payments, chat, reviews, and more. It's like a light switch panel for the whole app.",
    how: "The page shows a list of feature flags with toggle switches. Flip a switch to turn a feature on or off. The change happens immediately — no need to wait for a new version of the app.",
    use: "If something is broken (like payments), you can turn it off temporarily while it gets fixed. If you're testing a new feature, you can turn it on for everyone. But be careful — turning off a feature like 'signup' will stop new people from creating accounts.",
  },
  services: {
    what: "This page shows the list of service types (trades) that repair pros can offer — like engine repair, towing, AC repair, etc. You can turn each one on or off.",
    how: "The page loads the service catalog and shows each service with a toggle switch. Flip a switch to enable or disable that service type. You need to click Save for changes to take effect.",
    use: "If a certain service type is not available in your area, turn it off so customers don't request it. If you add a new service, make sure it's enabled here. Keep the names aligned with what customers see when signing up.",
  },
  matching: {
    what: "This page controls how the app decides which repair pros to show to customers. It's like setting rules for a dating app — how far away a pro can be, how many pros to show, and what qualifications they need.",
    how: "The page has input fields for: search radius (how many kilometers around the customer), max technicians (how many pros to show), minimum rating (only show pros with at least this rating), and verification requirements.",
    use: "Increase the radius if customers in rural areas aren't finding pros. Decrease it in cities to keep results relevant. Raise the minimum rating if you want only top-rated pros. Don't change these without understanding how they affect customers finding help.",
  },
  content: {
    what: "This page lets you edit the words that customers and pros see in the app — like menu titles, button labels, help text, and the list of common car problems. It's like editing a website without being a programmer.",
    how: "The page loads all editable content from the database and shows it in a form with text fields and text areas. You can change any text and save it. The app will show your new text immediately.",
    use: "Update the app copy to match your brand voice. Fix typos. Add new common car problems to the request form. Change menu item names if they're confusing. Be careful — customers will see your changes right away.",
  },
  health: {
    what: "This page checks if all the parts of Ona are working properly — the database, payment system, maps, and more. It's like a doctor running tests on the app to see if anything is sick.",
    how: "The page shows status cards for each system (green = healthy, red = problem). It also shows a table of recent errors. You can click 'Run full health check' to test everything right now. The page refreshes automatically every 60 seconds.",
    use: "If someone reports that the app isn't working, check this page first. Look for red cards (failed systems). Click 'Run full health check' to get fresh results. If you see failures, check the error details and contact the technical team.",
  },
  bookings: {
    what: "This page shows booking records — when someone schedules a service in advance. Each booking is linked to a job and a payment. It's like an appointment book.",
    how: "The page loads all bookings from the database and shows them in a table with the customer name, pro name, service type, date, and status. You can cross-check with the Jobs and Payments pages.",
    use: "Use this to find a specific booking or to see all scheduled services. If someone says they booked but can't find their job, check here. Cross-reference with Payments to make sure the booking was paid for.",
  },
};

export function AdminGuideBanner({ pageId }: { pageId: string }) {
  const [open, setOpen] = useState(false);
  const guide = GUIDES[pageId];
  if (!guide) return null;

  return (
    <div
      style={{
        marginBottom: 16,
        borderRadius: 10,
        border: "1px solid var(--om-border, #e5e7eb)",
        background: "var(--om-bg, #fff)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "10px 14px",
          border: 0,
          background: open ? "var(--om-nav, #f3f4f6)" : "transparent",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--om-text, #111827)",
          textAlign: "left",
          transition: "background 0.15s",
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>{open ? "−" : "+"}</span>
        <span>
          {open ? "Hide guide" : "Need help? Click to see what this page does"}
        </span>
      </button>

      {open && (
        <div style={{ padding: "4px 14px 14px", fontSize: 13, lineHeight: 1.6, color: "var(--om-text, #111827)" }}>
          <Section title="What is this page?">
            {guide.what}
          </Section>
          <Section title="How does it work?">
            {guide.how}
          </Section>
          <Section title="How do I use it?">
            {guide.use}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: 12, color: "var(--om-text-muted, #6b7280)" }}>
        {title}
      </p>
      <p style={{ margin: 0 }}>{children}</p>
    </div>
  );
}
