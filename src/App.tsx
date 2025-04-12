import React from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./pages/HomePage";
import "./styles/App.css";
import LivePage from "./pages/LivePage";

export default function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/live" element={<LivePage />} />
      </Routes>
    </div>
  );
}
