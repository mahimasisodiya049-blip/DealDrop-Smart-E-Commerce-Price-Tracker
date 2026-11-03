import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

// Instantiate Supabase Admin/Service Client for background cron jobs
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export async function GET(request) {
  try {
    // Initialize Resend lazily inside the runtime handler
    const resend = new Resend(process.env.RESEND_API_KEY);

    // 1. Fetch all products currently tracked in the database
    const { data: products, error: fetchError } = await supabase
      .from("products")
      .select("*");

    if (fetchError) {
      console.error("Cron fetch products error:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!products || products.length === 0) {
      return NextResponse.json({ message: "No products to check." });
    }

    const results = [];

    // 2. Iterate through products and re-scrape / check prices
    for (const product of products) {
      if (!product.url) continue;

      try {
        // Scrape current price via Firecrawl API
        const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          },
          body: JSON.stringify({
            url: product.url,
            formats: ["extract"],
            extract: {
              schema: {
                type: "object",
                properties: {
                  price: { type: "number" },
                },
                required: ["price"],
              },
            },
          }),
        });

        const scrapedData = await response.json();
        const newPrice = scrapedData?.data?.extract?.price;

        if (newPrice) {
          // Record new price point into price_history
          await supabase.from("price_history").insert([
            {
              product_id: product.id,
              price: newPrice,
              recorded_at: new Date().toISOString(),
            },
          ]);

          // Update current price on products table
          await supabase
            .from("products")
            .update({ current_price: newPrice })
            .eq("id", product.id);

          // If price dropped below target price and RESEND_API_KEY exists, send notification
          if (
            product.target_price &&
            newPrice <= product.target_price &&
            process.env.RESEND_API_KEY
          ) {
            await resend.emails.send({
              from: "DealDrop Alerts <onboarding@resend.dev>",
              to: product.user_email || "user@example.com",
              subject: `🚨 Price Drop Alert for ${product.title || "Tracked Product"}!`,
              html: `<p>Great news! The price for <strong>${product.title || "your item"
                }</strong> dropped to <strong>₹${newPrice}</strong>.</p>
                     <p><a href="${product.url}">Click here to view the deal</a></p>`,
            });
          }

          results.push({ id: product.id, status: "updated", price: newPrice });
        } else {
          results.push({ id: product.id, status: "skipped_no_price" });
        }
      } catch (err) {
        console.error(`Error processing product ${product.id}:`, err);
        results.push({ id: product.id, status: "error", error: err.message });
      }
    }

    return NextResponse.json({ success: true, processed: results });
  } catch (error) {
    console.error("Cron Handler Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}