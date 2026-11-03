"use server";

import { createClient } from "@/utils/supabase/server";
import { scrapeProduct } from "@/lib/firecrawl";
import { revalidatePath } from "next/cache";

export async function addProduct(formData) {
  const url = typeof formData === "string" ? formData : formData.get("url");

  if (!url) {
    return { error: "URL is required" };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Please sign in to track products." };
  }

  try {
    const productData = await scrapeProduct(url);

    if (!productData) {
      return { error: "Failed to scrape product details." };
    }

    const { data: newProduct, error: insertError } = await supabase
      .from("products")
      .insert([
        {
          user_id: user.id,
          url: url,
          title: productData.title,
          current_price: productData.currentPrice,
          target_price: productData.currentPrice,
          image: productData.image,
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      return { error: insertError.message };
    }

    if (newProduct) {
      await supabase.from("price_history").insert([
        {
          product_id: newProduct.id,
          price: productData.currentPrice,
        },
      ]);
    }

    revalidatePath("/");
    return { success: true, data: newProduct };
  } catch (err) {
    console.error("addProduct error:", err);
    return { error: err.message || "An unexpected error occurred." };
  }
}

export async function getProducts() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("products")
    .select("*, price_history(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Get products error:", error);
    return [];
  }

  return data || [];
}

export async function getPriceHistory(productId) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  // Fetch price history
  let { data, error } = await supabase
    .from("price_history")
    .select("*")
    .eq("product_id", productId)
    .order("recorded_at", { ascending: true });

  if (error) {
    console.error("Get price history error:", error);
    return [];
  }

  // Fallback: If no history exists yet, fetch the product's current_price and create a fallback entry
  if (!data || data.length === 0) {
    const { data: product } = await supabase
      .from("products")
      .select("current_price, created_at")
      .eq("id", productId)
      .single();

    if (product && product.current_price) {
      data = [
        {
          id: "fallback-1",
          product_id: productId,
          price: product.current_price,
          recorded_at: product.created_at || new Date().toISOString(),
        },
      ];
    }
  }

  return data || [];
}

export async function deleteProduct(productId) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/");
  return { success: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/");
  return { success: true };
}