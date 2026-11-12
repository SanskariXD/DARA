"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main
      style={{
        maxWidth: 560,
        margin: "15vh auto",
        padding: 24,
        fontFamily: "system-ui",
      }}
    >
      <h1>Let’s reopen your workspace.</h1>
      <p>
        Something interrupted this screen. Records already saved on this device
        are still here.
      </p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
