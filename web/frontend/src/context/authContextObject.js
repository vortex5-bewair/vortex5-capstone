import { createContext } from "react";

// Split out of AuthContext.jsx: a file exporting a component
// (AuthContextProvider) must export only components for Vite's Fast Refresh
// to hot-patch it instead of forcing a full reload — a non-component export
// living alongside one breaks that guarantee for the whole file.
export const AuthContext = createContext()
