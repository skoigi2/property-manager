"use client";

import { useState } from "react";
import type { Metadata } from "next";
import { BLOG_POSTS, type BlogPost } from "@/lib/blog-posts";
import { BlogCard } from "@/components/blog/BlogCard";

const CATEGORIES = ["All", "Finance", "Maintenance", "Software", "Systems"] as const;

export default function BlogIndexPage() {
  const [active, setActive] = useState<"All" | BlogPost["category"]>("All");

  const posts = active === "All"
    ? BLOG_POSTS
    : BLOG_POSTS.filter((p) => p.category === active);

  return (
    <div className="min-h-screen">
      {/* ── Hero ── */}
      <section className="pt-28 pb-14 px-6 bg-cream dark:bg-[#0C1B2E]">
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-block bg-gold/10 dark:bg-gold/15 text-gold-dark text-xs font-semibold px-4 py-1.5 rounded-full mb-6 border border-gold/20">
            The Landlord&apos;s Playbook
          </span>
          <h1 className="font-display text-4xl md:text-5xl text-header dark:text-white leading-tight mb-4">
            Practical guides for property managers<br className="hidden md:block" /> who want systems, not stress
          </h1>
          <p className="text-gray-500 dark:text-gray-400 font-sans text-lg leading-relaxed">
            No fluff. No theory. Just actionable systems for landlords actively managing 2–50 properties.
          </p>
        </div>
      </section>

      {/* ── Filter + grid ── */}
      <section className="px-6 py-12 bg-white dark:bg-[#0C1B2E]">
        <div className="max-w-5xl mx-auto">
          {/* Category filter */}
          <div className="flex flex-wrap gap-2 mb-10">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActive(cat)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium font-sans transition-colors ${
                  active === cat
                    ? "bg-header dark:bg-gold text-white dark:text-header"
                    : "bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/15"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Post grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA strip ── */}
      <section className="px-6 py-14 bg-cream dark:bg-[#091525] border-t border-gray-100 dark:border-white/10 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="font-display text-2xl text-header dark:text-white mb-3">
            Ready to put these systems to work?
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-sans mb-6">
            Groundwork PM is built for landlords managing 2–50 properties. Try it free for 30 days.
          </p>
          <a
            href="/signup"
            className="inline-block bg-header dark:bg-gold text-white dark:text-header font-semibold text-sm px-8 py-3 rounded-lg hover:bg-header/90 dark:hover:bg-gold/90 transition-colors"
          >
            Start free trial →
          </a>
        </div>
      </section>
    </div>
  );
}
