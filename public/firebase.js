// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA1IFMKKWfBYyGL7Pr3ROqdyY7o4Drr8WA",
  authDomain: "greenecoquest.firebaseapp.com",
  projectId: "greenecoquest",
  storageBucket: "greenecoquest.firebasestorage.app",
  messagingSenderId: "924671563205",
  appId: "1:924671563205:web:14d1c733c5dceac353e7ac",
  measurementId: "G-D4CKT860SF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);