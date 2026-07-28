import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

const DEMO_WEBSITE_ID = "a1111111-1111-1111-1111-111111111111";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pacific Health Group — Care Navigation & Member Support" },
      {
        name: "description",
        content:
          "Pacific Health Group connects members to enhanced care management, housing supports, and enrollment help. Chat with our support assistant or reach a live specialist.",
      },
      { property: "og:title", content: "Pacific Health Group — Care Navigation & Member Support" },
      {
        property: "og:description",
        content:
          "Enhanced care management, community supports, referrals, and enrollment assistance across California counties.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const services = [
  {
    title: "Enhanced Care Management",
    body: "A dedicated care team coordinates your doctors, medications, and follow-ups so nothing falls through the cracks.",
  },
  {
    title: "Community Supports",
    body: "Housing navigation, medically tailored meals, respite care, and other non-medical services at no cost to eligible members.",
  },
  {
    title: "Referrals & Enrollment",
    body: "Providers and members can submit a referral in minutes. Our intake team confirms eligibility and follows up quickly.",
  },
];

function Index() {
  useEffect(() => {
    if (document.querySelector("script[data-website-id]")) return;
    const s = document.createElement("script");
    s.src = "/api/public/widget.js";
    s.async = true;
    s.setAttribute("data-website-id", DEMO_WEBSITE_ID);
    document.body.appendChild(s);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              PH
            </div>
            <span className="text-lg font-semibold tracking-tight">Pacific Health Group</span>
          </div>
          <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
            <a href="#services" className="hover:text-foreground">
              Services
            </a>
            <a href="#counties" className="hover:text-foreground">
              Counties
            </a>
            <a href="#support" className="hover:text-foreground">
              Support
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 py-20">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            Member & provider support
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Care navigation that meets people where they are.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Pacific Health Group delivers enhanced care management and community supports across
            California. Ask our assistant a question, or connect with a live specialist any time
            during business hours.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <span className="rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground">
              Chat with us — bottom right
            </span>
            <a
              href="/widget?w=a1111111-1111-1111-1111-111111111111"
              className="rounded-md border border-input px-5 py-3 text-sm font-medium hover:bg-accent"
            >
              Open widget standalone
            </a>
          </div>
        </section>

        <section id="services" className="border-y border-border bg-card">
          <div className="mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-3">
            {services.map((s) => (
              <article key={s.title} className="rounded-xl border border-border bg-background p-6">
                <h2 className="text-lg font-semibold">{s.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="counties" className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Where we serve</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Programs are available to eligible Medi-Cal members in Los Angeles, Orange, Riverside,
            San Bernardino, and San Diego counties, with health plan partners across the region.
          </p>
        </section>

        <section id="support" className="border-t border-border bg-card">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">Need help right now?</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Use the chat bubble in the corner to ask about eligibility, submit a referral, request
              enrollment help, or ask to speak with a live agent. If you are in crisis, call 988 or
              911 immediately.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">
          © {new Date().getFullYear()} Pacific Health Group. This is a demonstration site for the
          chat platform.
        </div>
      </footer>
    </div>
  );
}
