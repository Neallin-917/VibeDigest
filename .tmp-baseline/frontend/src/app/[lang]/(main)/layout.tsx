import { MainShell } from "@/components/layout/MainShell";

export default function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return <MainShell>{children}</MainShell>;
}
