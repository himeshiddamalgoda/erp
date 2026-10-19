import "./globals.css";
import { AppProviders } from "@/providers/app-providers";
export const metadata = {
  title: { default: "Quotations · Thread ERP", template: "%s · Thread ERP" },
  description:
    "A connected workspace for garment quotations, sales orders and delivery operations.",
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
