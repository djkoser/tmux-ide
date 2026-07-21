import DirectoryPage from "./DirectoryPage";

// Required for Next.js static export — generates a placeholder HTML shell.
// At runtime, the client-side router reads the real directory name from the URL.
export function generateStaticParams() {
  return [{ name: "__fallback" }];
}

export default function Page() {
  return <DirectoryPage />;
}
