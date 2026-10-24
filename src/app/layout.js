import "./globals.css";
import FirebaseAppCheck from "@/components/FirebaseAppCheck";

export const metadata = {
  title: "My Prayer Line",
  description: "Find community in every prayer."
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f8f5"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <FirebaseAppCheck />
        {children}
      </body>
    </html>
  );
}