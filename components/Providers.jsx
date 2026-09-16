"use client";

import { AuthProvider } from '../context/AuthContext';
import { InventoryProvider } from '../context/InventoryContext';
import { Toaster } from 'react-hot-toast';

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <InventoryProvider>
        {children}
        <Toaster position="top-right" containerStyle={{ zIndex: 11000 }} />
      </InventoryProvider>
    </AuthProvider>
  );
}
