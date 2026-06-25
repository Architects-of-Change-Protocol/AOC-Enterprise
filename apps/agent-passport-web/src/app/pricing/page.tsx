import Link from 'next/link';
import { AGENT_PASSPORT_TIERS } from '@/lib/pricing';
import { PricingCard } from '@/components/PricingCard';
import { FAQItem } from '@/components/FAQItem';

export const metadata = {
  title: 'Pricing — AOC Agent Passport',
  description: 'Agent Passport, Governed Agent, and Organization Registry. Simple, transparent pricing.',
};

const FAQ = [
  {
    question: 'Is this a security tool?',
    answer: 'AOC Agent Passport is a governance identity and verification layer. Runtime Guard integration can support action-level enforcement, but this MVP is not a replacement for enterprise security controls.',
  },
  {
    question: 'Can someone remove the passport from an agent?',
    answer: "Outside a governed runtime, removing the passport destroys the agent's AOC-governed verification status. Inside a governed runtime, missing or invalid passports must cause governed execution to fail.",
  },
  {
    question: "Does this control the model's reasoning?",
    answer: "No. Runtime Guard Lite does not control the model's internal reasoning. It controls whether a governed action is allowed to become real-world execution.",
  },
  {
    question: 'Is the passport public?',
    answer: 'The verification page is public-safe and does not expose sensitive internal metadata. It shows governance status, hashes, issuer, and verification results.',
  },
  {
    question: 'Is this production-ready?',
    answer: 'This MVP demonstrates the complete passport and verification flow. Production hardening requires persistent storage, production issuer key management, billing records, and stronger operational controls.',
  },
];

export default function PricingPage() {
  return (
    <div>
      <section className="hero">
        <div className="container">
          <div className="section-label">Pricing</div>
          <h1 style={{ fontSize: 'clamp(24px,4vw,40px)' }}>Simple, transparent pricing.</h1>
          <p>Agent identity and runtime governance infrastructure. One price per tier.</p>
        </div>
      </section>

      <div className="divider" />

      <section className="section">
        <div className="container-wide">
          <div className="alert alert-warning" style={{ marginBottom: 32, fontSize: 13 }}>
            This is an MVP product. Passports are stored in-memory and will be lost on server restart. Production persistence is in the next sprint.
          </div>
          <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {AGENT_PASSPORT_TIERS.map(tier => (
              <PricingCard key={tier.key} tier={tier} />
            ))}
          </div>
        </div>
      </section>

      <div className="divider" />

      <section className="section">
        <div className="container" style={{ maxWidth: 640 }}>
          <div className="section-label">FAQ</div>
          <h2 style={{ marginBottom: 32 }}>Frequently asked questions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {FAQ.map(item => (
              <FAQItem key={item.question} question={item.question} answer={item.answer} />
            ))}
          </div>
        </div>
      </section>

      <div className="divider" />

      <section className="section" style={{ textAlign: 'center' }}>
        <div className="container">
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
            Want to see what a passport looks like before buying?
          </p>
          <Link href="/sample-passport" className="btn btn-secondary">
            View SalesBot CR Sample Passport
          </Link>
        </div>
      </section>
    </div>
  );
}
