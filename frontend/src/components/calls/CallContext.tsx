import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "../../context/AuthContext";
import { useCallController } from "./useCallController";
import { CallOverlay } from "./CallOverlay";

type Calls = ReturnType<typeof useCallController>;
const Context = createContext<Calls | null>(null);
export const useCalls = () => useContext(Context);

/** Keep call ownership and media alive while React Router changes pages. */
export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const controller = useCallController(user?.id);
  return <Context.Provider value={controller}>{children}<CallOverlay controller={controller} /></Context.Provider>;
}
