"use client";

import { AuthProvider } from '../context/AuthContext';
import { InventoryProvider } from '../context/InventoryContext';

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <InventoryProvider>
        {children}
      </InventoryProvider>
    </AuthProvider>
  );
}
