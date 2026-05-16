import Link from "next/link";
import { Database, Mail, CalendarClock, GaugeCircle } from "lucide-react";

interface Card {
  icon: React.ReactNode;
  heading: string;
  body: string;
  proof: string;
}

const CARDS: Card[] = [
  {
    icon: <Database className="w-7 h-7 text-gold" />,
    heading: "Stop reconciling. The platform already did it.",
    body: "The link between a paid invoice and a posted income entry is enforced at the database level, not as a \"best effort\" sync. There is no scenario where the books and the statement disagree.",
    proof: "Owner statements are always up to date. No manual refresh needed.",
  },
  {
    icon: <Mail className="w-7 h-7 text-gold" />,
    heading: "Owners approve repairs from their email, not your phone.",
    body: "Send a magic-link approval request; the owner clicks Approve or Reject from email; the case advances stages on its own. The waiting clock pauses while it's with them.",
    proof: "Replaces: WhatsApp screenshots and three days of follow-up.",
  },
  {
    icon: <CalendarClock className="w-7 h-7 text-gold" />,
    heading: "Expiries surface themselves before they become problems.",
    body: "Daily checks for lease ends, insurance renewals, and compliance certificates. The same items appear in your inbox until they're resolved, and the cron de-duplicates so you only get one email per threshold.",
    proof: "Two warning levels: 30 days out, then 7 days out.",
  },
  {
    icon: <GaugeCircle className="w-7 h-7 text-gold" />,
    heading: "Cases that go quiet come back to the top.",
    body: "Every workflow stage has an SLA budget. If a case stalls past it, the system surfaces it in your inbox automatically — and pauses the clock when you're waiting on a vendor or owner.",
    proof: "Replaces: the weekly \"what was I doing about that?\" review.",
  },
];

export function AutomationCards() {
  return (
    <section id="outcomes" className="py-24 px-6 bg-white dark:bg-[#0C1B2E]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="font-display text-3xl md:text-4xl text-header dark:text-white mb-4 leading-snug">
            What changes when you switch.
          </h2>
          <p className="text-gray-500 dark:text-gray-400 font-sans text-base max-w-xl mx-auto leading-relaxed">
            Four automations that remove manual admin from the daily rhythm.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {CARDS.map((card) => (
            <div
              key={card.heading}
              className="bg-cream-dark dark:bg-[#162032] rounded-2xl p-7 border border-gray-100 dark:border-white/10 shadow-[0_2px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_24px_rgba(0,0,0,0.3)] transition-shadow flex flex-col"
            >
              <div className="w-12 h-12 bg-gold/10 dark:bg-gold/15 rounded-xl flex items-center justify-center mb-5">
                {card.icon}
              </div>
              <h3 className="font-display text-lg md:text-xl text-header dark:text-white mb-3 leading-snug">
                {card.heading}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-sans leading-relaxed mb-4 flex-1">
                {card.body}
              </p>
              <p className="text-xs font-mono text-gold-dark dark:text-gold/80 leading-relaxed pt-3 border-t border-gray-100 dark:border-white/5">
                {card.proof}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <Link href="/signup?demo=al-seef" className="text-sm font-sans text-gold hover:text-gold-dark transition-colors">
            See it in the demo →
          </Link>
        </div>
      </div>
    </section>
  );
}
