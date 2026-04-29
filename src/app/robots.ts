import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/privacy", "/terms", "/refund"],
        disallow: [
          "/dashboard",
          "/login",
          "/signup",
          "/forgot-password",
          "/reset-password",
          "/select-org",
          "/onboarding",
          "/portal/",
          "/api/",
        ],
      },
    ],
    sitemap: "https://groundworkpm.com/sitemap.xml",
  };
}
