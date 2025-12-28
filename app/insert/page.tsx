"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import AuthGate from "@/components/AuthGate";
import TopNav from "@/components/TopNav";
import { supabase } from "@/lib/supabaseClient";

type Category = {
  id: number;
  category: string;
};

type FormState = {
  item: string;
  price: string;
  categoryId: string;
  tag: string;
  date: string;
};

type Status = {
  type: "success" | "error";
  message: string;
} | null;

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function InsertForm({ session }: { session: Session }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryStatus, setCategoryStatus] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    item: "",
    price: "",
    categoryId: "",
    tag: "",
    date: getTodayDateString(),
  });
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadCategories() {
      const { data, error } = await supabase
        .from("category")
        .select("id, category")
        .order("category", { ascending: true });

      if (!active) return;

      if (error) {
        setCategoryStatus(error.message);
      } else {
        setCategories(data ?? []);
      }
    }

    loadCategories();

    return () => {
      active = false;
    };
  }, []);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const item = form.item.trim();
    const categoryId = Number(form.categoryId);
    const priceValue = Number(form.price);

    if (!item || !Number.isFinite(categoryId)) {
      setStatus({ type: "error", message: "Item and category are required." });
      return;
    }

    if (!Number.isFinite(priceValue)) {
      setStatus({ type: "error", message: "Enter a valid price." });
      return;
    }

    setSaving(true);

    const payload = {
      item,
      price: Math.round(priceValue),
      category_id: categoryId,
      tag: form.tag.trim() || null,
      user_id: session.user.id,
      date: form.date || null,
    };

    const { error } = await supabase.from("expense").insert(payload);

    if (error) {
      setStatus({ type: "error", message: error.message });
    } else {
      setStatus({ type: "success", message: "Expense saved." });
      setForm((prev) => ({
        item: "",
        price: "",
        categoryId: prev.categoryId,
        tag: "",
        date: getTodayDateString(),
      }));
    }

    setSaving(false);
  }

  return (
    <main className="shell">
      <TopNav email={session.user.email} />
      <section className="grid">
        <div className="card">
          <h1 className="section-title">Legg til en ny utgift</h1>
          <form className="form-grid" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="item">Beskrivelse</label>
              <input
                id="item"
                value={form.item}
                onChange={(event) => updateField("item", event.target.value)}
                placeholder="Øl på skyggesiden"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="price">Pris</label>
              <input
                id="price"
                type="number"
                min="0"
                step="1"
                value={form.price}
                onChange={(event) => updateField("price", event.target.value)}
                placeholder="123"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="category">Kategori</label>
              <select
                id="category"
                value={form.categoryId}
                onChange={(event) =>
                  updateField("categoryId", event.target.value)
                }
                required
              >
                <option value="">Velg kategori</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.category}
                  </option>
                ))}
              </select>
              {categoryStatus ? (
                <span className="helper">{categoryStatus}</span>
              ) : categories.length === 0 ? (
                <span className="helper">Ingen kategorier tilgjengelig</span>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="tag">Tag</label>
              <input
                id="tag"
                value={form.tag}
                onChange={(event) => updateField("tag", event.target.value)}
                placeholder="Tanzania"
              />
            </div>
            <div className="field">
              <label htmlFor="date">Dato</label>
              <input
                id="date"
                type="date"
                value={form.date}
                onChange={(event) => updateField("date", event.target.value)}
              />
            </div>
            <div className="form-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save expense"}
              </button>
              {status ? <span className="status">{status.message}</span> : null}
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}

export default function InsertPage() {
  return <AuthGate>{(session) => <InsertForm session={session} />}</AuthGate>;
}
