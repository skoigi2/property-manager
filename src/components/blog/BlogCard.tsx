import Link from "next/link";
import { CATEGORY_COLORS, formatDate, type BlogPost } from "@/lib/blog-posts";

export function BlogCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col bg-white dark:bg-[#111F30] border border-gray-100 dark:border-white/10 rounded-2xl p-6 hover:shadow-card-hover hover:border-gold/30 dark:hover:border-gold/20 transition-all duration-200"
    >
      <div className="flex items-center justify-between mb-4">
        <span className={`text-xs font-semibold px-3 py-1 rounded-full ${CATEGORY_COLORS[post.category]}`}>
          {post.category}
        </span>
        <span className="text-xs text-gray-400 font-sans">{post.readTime}</span>
      </div>

      <h2 className="font-display text-lg text-header dark:text-white leading-snug mb-3 group-hover:text-gold-dark dark:group-hover:text-gold transition-colors">
        {post.title}
      </h2>

      <p className="text-sm text-gray-500 dark:text-gray-400 font-sans leading-relaxed flex-1 mb-4">
        {post.excerpt}
      </p>

      <div className="flex items-center justify-between pt-4 border-t border-gray-50 dark:border-white/5">
        <span className="text-xs text-gray-400 font-sans">{formatDate(post.date)}</span>
        <span className="text-xs font-semibold text-gold-dark dark:text-gold group-hover:underline">
          Read article →
        </span>
      </div>
    </Link>
  );
}
