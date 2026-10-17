import "./globals.css";
import FirebaseAppCheck from "@/components/FirebaseAppCheck";

export const metadata = {
  title: "My Prayer Line",
  description: "Find community in every prayer."
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
