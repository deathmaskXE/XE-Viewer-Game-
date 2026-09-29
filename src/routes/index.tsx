import { createFileRoute } from "@tanstack/react-router";
import { Bench } from "@/components/bench/Bench";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <Bench />;
}
