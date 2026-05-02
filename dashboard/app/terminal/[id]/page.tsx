import TerminalClient from "./terminal";

export function generateStaticParams() {
  return [{ id: "default" }];
}

export default async function TerminalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TerminalClient id={id} />;
}
