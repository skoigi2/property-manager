export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  category: "Finance" | "Maintenance" | "Software" | "Systems";
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "why-property-management-breaks-down-after-10-units",
    title: "Why Property Management Breaks Down After 10 Units",
    excerpt: "Ten units is the wall most landlords hit. Not because the work is harder — because the system that got you here was you. Here's what breaks, and why.",
    date: "2026-05-30",
    readTime: "8 min read",
    category: "Systems",
  },
  {
    slug: "hidden-cost-of-whatsapp-maintenance-tracking",
    title: "The Hidden Cost of Using WhatsApp for Maintenance Tracking",
    excerpt: "WhatsApp feels free. But lost jobs, slow responses and untracked spend quietly cost you more than any software ever would. Here's the real bill.",
    date: "2026-05-28",
    readTime: "7 min read",
    category: "Maintenance",
  },
  {
    slug: "what-good-property-management-looks-like-behind-the-scenes",
    title: "What “Good” Property Management Actually Looks Like Behind the Scenes",
    excerpt: "Great property management looks calm from the outside. Behind the scenes, it's a handful of deliberate systems doing the remembering for you.",
    date: "2026-05-26",
    readTime: "7 min read",
    category: "Systems",
  },
  {
    slug: "why-spreadsheets-feel-fine-until-they-dont",
    title: "Why Spreadsheets Feel Fine Until Suddenly They Don't",
    excerpt: "Spreadsheets don't fail gradually — they fail all at once, usually at the worst moment. Here's why the breakdown feels so sudden, and how to see it coming.",
    date: "2026-05-23",
    readTime: "6 min read",
    category: "Software",
  },
  {
    slug: "real-reason-landlords-miss-rent-payments",
    title: "The Real Reason Landlords Miss Rent Payments (It's Not Tenants)",
    excerpt: "Most missed rent isn't a tenant problem — it's a tracking problem. Here are the operational gaps that quietly lose income, and how to close them.",
    date: "2026-05-20",
    readTime: "7 min read",
    category: "Finance",
  },
  {
    slug: "how-to-manage-multiple-rental-properties",
    title: "How to Manage Multiple Rental Properties Without Spreadsheets",
    excerpt: "At two properties a spreadsheet works fine. At five it starts breaking down. Here's the step-by-step system that actually scales.",
    date: "2026-04-28",
    readTime: "7 min read",
    category: "Systems",
  },
  {
    slug: "best-property-management-software-small-landlords",
    title: "Best Property Management Software for Small Landlords (2–20 Properties)",
    excerpt: "Most property software is built for 200-unit complexes. Small landlords need something different — here's what to look for.",
    date: "2026-04-25",
    readTime: "8 min read",
    category: "Software",
  },
  {
    slug: "how-to-track-rent-payments",
    title: "How to Track Rent Payments and Avoid Missed Income (Complete Guide)",
    excerpt: "Missed rent isn't always the tenant's fault. Sometimes landlords just lose track. Here's how to build a system that catches everything.",
    date: "2026-04-22",
    readTime: "6 min read",
    category: "Finance",
  },
  {
    slug: "manage-property-maintenance-without-whatsapp",
    title: "How to Manage Property Maintenance Without WhatsApp (And Avoid Missed Jobs)",
    excerpt: "WhatsApp is not a maintenance system — it just feels like one. Here's what happens when you rely on it, and what to use instead.",
    date: "2026-04-18",
    readTime: "6 min read",
    category: "Maintenance",
  },
  {
    slug: "property-management-software-vs-excel",
    title: "Property Management Software vs Excel: What Actually Works for Landlords?",
    excerpt: "Excel isn't the problem. Scale is. Here's exactly where spreadsheets break down — and what software does that Excel simply can't.",
    date: "2026-04-14",
    readTime: "7 min read",
    category: "Software",
  },
  {
    slug: "run-rental-properties-like-a-business",
    title: "How to Run Your Rental Properties Like a Business (Systems, Not Spreadsheets)",
    excerpt: "The landlords who scale don't work harder — they build systems. Here are the five systems every serious property manager needs.",
    date: "2026-04-10",
    readTime: "8 min read",
    category: "Systems",
  },
];

export const CATEGORY_COLORS: Record<BlogPost["category"], string> = {
  Finance:     "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Maintenance: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Software:    "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Systems:     "bg-gold/10 text-gold-dark dark:bg-gold/20 dark:text-gold",
};

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}
