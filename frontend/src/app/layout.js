import "./globals.css";

export const metadata = {
  title: "ERP",
  description: "ERP application",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
