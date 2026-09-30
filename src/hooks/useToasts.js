import { useSyncExternalStore } from "react";
import { subscribe, getToasts } from "../services/toastService";

export default function useToasts() {
  return useSyncExternalStore(subscribe, getToasts, getToasts);
}