"use client";

import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: "center", fontFamily: "Inter, sans-serif" }}>
          <h2 style={{ color: "#ef4444", marginBottom: 12 }}>Đã xảy ra lỗi</h2>
          <p style={{ color: "#64748b", marginBottom: 20 }}>
            {this.state.error?.message || "Lỗi không xác định"}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "10px 24px",
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Thử lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
