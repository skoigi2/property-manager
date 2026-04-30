import Link from "next/link";
import { CATEGORY_COLORS, formatDate, type BlogPost } from "@/lib/blog-posts";

// ─── Inline trial CTA ─────────────────────────────────────────────────────────

export function TrialCTA({ headline = "Ready to stop managing properties the hard way?" }: { headline?: string }) {
  return (
    <div className="not-prose my-10 rounded-2xl bg-header dark:bg-[#091525] p-8 text-center">
      <p className="font-display text-xl text-white mb-2">{headline}</p>
      <p className="text-white/60 text-sm font-sans mb-6">
        30-day free trial · No credit card required · Cancel anytime
      </p>
      <Link
        href="/signup"
        className="inline-block bg-gold text-header font-semibold text-sm px-8 py-3 rounded-lg hover:bg-gold/90 transition-colors"
      >
        Start free trial →
      </Link>
    </div>
  );
}

// ─── Article layout ───────────────────────────────────────────────────────────

interface BlogPostProps {
  post: Pick<BlogPost, "title" | "date" | "readTime" | "category" | "slug">;
  children: React.ReactNode;
}

export function BlogPostLayout({ post, children }: BlogPostProps) {
  return (
    <div className="min-h-screen">
      {/* ── Hero ── */}
      <div className="pt-28 pb-12 px-6 bg-cream dark:bg-[#0C1B2E]">
        <div className="max-w-3xl mx-auto">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-gray-400 font-sans mb-6">
            <Link href="/" className="hover:text-header dark:hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/blog" className="hover:text-header dark:hover:text-white transition-colors">Blog</Link>
            <span>/</span>
            <span className="text-gray-500 dark:text-gray-400 truncate max-w-xs">{post.title}</span>
          </nav>

          {/* Category + title */}
          <span className={`inline-block text-xs font-semibold px-3 py-1 rounded-full mb-4 ${CATEGORY_COLORS[post.category]}`}>
            {post.category}
          </span>
          <h1 className="font-display text-3xl md:text-4xl text-header dark:text-white leading-tight mb-4">
            {post.title}
          </h1>

          {/* Meta strip */}
          <div className="flex items-center gap-4 text-sm text-gray-400 font-sans">
            <span>{formatDate(post.date)}</span>
            <span>·</span>
            <span>{post.readTime}</span>
          </div>
        </div>
      </div>

      {/* ── Article body ── */}
      <div className="bg-white dark:bg-[#0C1B2E] px-6 py-12">
        <div className="max-w-3xl mx-auto">
          <article className="prose prose-gray dark:prose-invert prose-headings:font-display prose-headings:text-header dark:prose-headings:text-white prose-h2:text-2xl prose-h3:text-lg prose-p:text-gray-600 dark:prose-p:text-gray-300 prose-p:leading-relaxed prose-li:text-gray-600 dark:prose-li:text-gray-300 prose-strong:text-header dark:prose-strong:text-white prose-a:text-header dark:prose-a:text-gold prose-a:no-underline hover:prose-a:underline max-w-none">
            {children}
          </article>
        </div>
      </div>

      {/* ── Closing CTA ── */}
      <div className="bg-cream dark:bg-[#091525] border-t border-gray-100 dark:border-white/10 px-6 py-16 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="font-display text-2xl text-header dark:text-white mb-3">
            Start managing your properties like a business
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-sans mb-8">
            Groundwork PM gives you income tracking, maintenance logs, tenant management, and owner reports — all in one platform. 30-day free trial, no credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/signup"
              className="bg-header dark:bg-gold text-white dark:text-header font-semibold text-sm px-8 py-3 rounded-lg hover:bg-header/90 dark:hover:bg-gold/90 transition-colors"
            >
              Start free trial
            </Link>
            <Link
              href="/pricing"
              className="border border-gray-200 dark:border-white/20 text-gray-600 dark:text-gray-300 font-semibold text-sm px-8 py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
            >
              See pricing
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
