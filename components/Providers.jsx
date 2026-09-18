"use client";

import { AuthProvider } from '../context/AuthContext';
import { InventoryProvider } from '../context/InventoryContext';
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from './ErrorBoundary';

export default function Providers({ children }) {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <InventoryProvider>
          {children}
          <Toaster position="top-right" containerStyle={{ zIndex: 11000 }} />
        </InventoryProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
