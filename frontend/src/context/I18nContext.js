import { createContext, useContext, useState } from "react";

const strings = {
  en: {
    dashboard: "Dashboard", khata: "Khata", inventory: "Inventory", suppliers: "Suppliers",
    analytics: "Analytics", todaySales: "Today's Sales", outstanding: "Dues Outstanding",
    overdue: "Overdue Accounts", lowStock: "Low Stock Items", customers: "Customers",
    addCustomer: "Add Customer", name: "Name", phone: "Phone", creditLimit: "Credit Limit",
    save: "Save", cancel: "Cancel", balance: "Balance", creditGiven: "Credit Given (Udhaar)",
    paymentReceived: "Payment Received", amount: "Amount", note: "Note", record: "Record",
    sendReminder: "Send Reminder", reminderSent: "Reminder sent (SMS + WhatsApp)",
    products: "Products", addProduct: "Add Product", price: "Price", stock: "Stock",
    lowStockThreshold: "Low Stock Alert At", scanBill: "Scan Bill (OCR)", uploadBill: "Upload bill photo",
    confirmItems: "Confirm extracted items", addToStock: "Add to Stock", sell: "Sell",
    qty: "Qty", addSupplier: "Add Supplier", address: "Address", reorderSuggestions: "Reorder Suggestions",
    purchaseOrders: "Purchase Orders", createPO: "Create PO", draft: "Draft", sent: "Sent",
    received: "Received", markSent: "Mark Sent", markReceived: "Mark Received", topItems: "Top Items",
    agingDistribution: "Dues Aging", daily: "Daily", weekly: "Weekly", monthly: "Monthly",
    login: "Login", signup: "Sign Up", email: "Email", password: "Password", shopName: "Shop Name",
    logout: "Logout", notifications: "Notifications", noNotifications: "No notifications",
    customerLogin: "Customer Login", sendOtp: "Send OTP", verifyOtp: "Verify OTP", otp: "OTP",
    myKhata: "My Khata", transactions: "Transactions", capWarning: "Large amount — above ₹80 Lakh",
    capBlocked: "Blocked — exceeds ₹1 Crore cap", search: "Search", noCustomers: "No customers yet. Add your first customer.",
    noProducts: "No products yet.", noSuppliers: "No suppliers yet.", days: "days",
    cashSale: "Cash Sale", creditSale: "Credit Sale", mode: "Mode", customer: "Customer",
    processing: "Reading bill with AI...", suggestedQty: "Suggested",
  },
  hi: {
    dashboard: "डैशबोर्ड", khata: "खाता", inventory: "इन्वेंटरी", suppliers: "सप्लायर",
    analytics: "एनालिटिक्स", todaySales: "आज की बिक्री", outstanding: "बकाया राशि",
    overdue: "ओवरड्यू खाते", lowStock: "कम स्टॉक", customers: "ग्राहक",
    addCustomer: "ग्राहक जोड़ें", name: "नाम", phone: "फ़ोन", creditLimit: "उधार सीमा",
    save: "सेव करें", cancel: "रद्द करें", balance: "बैलेंस", creditGiven: "उधार दिया",
    paymentReceived: "भुगतान मिला", amount: "राशि", note: "नोट", record: "दर्ज करें",
    sendReminder: "रिमाइंडर भेजें", reminderSent: "रिमाइंडर भेजा गया (SMS + WhatsApp)",
    products: "प्रोडक्ट", addProduct: "प्रोडक्ट जोड़ें", price: "कीमत", stock: "स्टॉक",
    lowStockThreshold: "कम स्टॉक अलर्ट", scanBill: "बिल स्कैन (OCR)", uploadBill: "बिल की फोटो अपलोड करें",
    confirmItems: "आइटम कन्फर्म करें", addToStock: "स्टॉक में जोड़ें", sell: "बेचें",
    qty: "मात्रा", addSupplier: "सप्लायर जोड़ें", address: "पता", reorderSuggestions: "रीऑर्डर सुझाव",
    purchaseOrders: "परचेज़ ऑर्डर", createPO: "PO बनाएं", draft: "ड्राफ्ट", sent: "भेजा गया",
    received: "प्राप्त", markSent: "भेजा गया चिह्नित करें", markReceived: "प्राप्त चिह्नित करें", topItems: "टॉप आइटम",
    agingDistribution: "बकाया एजिंग", daily: "दैनिक", weekly: "साप्ताहिक", monthly: "मासिक",
    login: "लॉगिन", signup: "साइन अप", email: "ईमेल", password: "पासवर्ड", shopName: "दुकान का नाम",
    logout: "लॉगआउट", notifications: "सूचनाएं", noNotifications: "कोई सूचना नहीं",
    customerLogin: "ग्राहक लॉगिन", sendOtp: "OTP भेजें", verifyOtp: "OTP सत्यापित करें", otp: "OTP",
    myKhata: "मेरा खाता", transactions: "लेन-देन", capWarning: "बड़ी राशि — ₹80 लाख से अधिक",
    capBlocked: "ब्लॉक — ₹1 करोड़ सीमा से अधिक", search: "खोजें", noCustomers: "अभी कोई ग्राहक नहीं। पहला ग्राहक जोड़ें।",
    noProducts: "अभी कोई प्रोडक्ट नहीं।", noSuppliers: "अभी कोई सप्लायर नहीं।", days: "दिन",
    cashSale: "नकद बिक्री", creditSale: "उधार बिक्री", mode: "मोड", customer: "ग्राहक",
    processing: "AI से बिल पढ़ा जा रहा है...", suggestedQty: "सुझाव",
  },
};

const I18nContext = createContext(null);

export const I18nProvider = ({ children }) => {
  const [lang, setLangState] = useState(localStorage.getItem("sk_lang") || "en");
  const setLang = (l) => { localStorage.setItem("sk_lang", l); setLangState(l); };
  const t = (key) => strings[lang][key] || strings.en[key] || key;
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);
