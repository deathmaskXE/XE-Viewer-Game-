import { Component, type ErrorInfo, type ReactNode } from "react";

export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message || "Error al dibujar el visor." };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("XE Game Viewer", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#08131c] p-6 text-center text-white">
        <h1 className="text-xl">No se pudo mostrar esta placa</h1>
        <p className="max-w-lg text-sm">{this.state.error}</p>
        <button className="rounded bg-cyan-600 px-4 py-2" onClick={() => { window.localStorage.removeItem("mesa-active"); window.location.reload(); }}>
          Volver a abrir el visor
        </button>
      </main>
    );
  }
}
