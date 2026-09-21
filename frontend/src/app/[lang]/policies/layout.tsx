import { LandingNav } from '@/components/landing/LandingNav'

export default function PoliciesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav variant="content" />
      <main className="pt-24 pb-12">{children}</main>
    </div>
  )
}
