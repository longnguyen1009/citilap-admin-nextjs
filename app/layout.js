import "./globals.css";
import Providers from "../components/Providers";

export const metadata = {
  title: "CitiLap Admin",
  description: "CitiLap Admin Dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body className="antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
