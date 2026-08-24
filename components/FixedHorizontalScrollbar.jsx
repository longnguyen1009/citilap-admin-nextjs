import React, { useState, useEffect, useRef } from 'react';

/**
 * FixedHorizontalScrollbar
 * Component thanh cuộn ngang cố định ở đáy màn hình (viewport bottom),
 * đồng bộ 2 chiều với container bảng dữ liệu.
 */
export default function FixedHorizontalScrollbar({ containerRef, totalWidth }) {
  const scrollbarRef = useRef(null);
  const isSyncing = useRef(false);
  const [bounds, setBounds] = useState({ left: 0, width: 0, show: false, scrollWidth: totalWidth || 0 });

  useEffect(() => {
    const updateBounds = () => {
      if (!containerRef || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      const scrollWidth = containerRef.current.scrollWidth || totalWidth || 0;
      const clientWidth = containerRef.current.clientWidth || 0;
      const isOverflowing = scrollWidth > clientWidth + 5;
      
      // Đã ẩn thanh cuộn nguyên bản bằng CSS -> Thanh cuộn cố định này là DUY NHẤT cho bảng
      const isVisibleOnScreen = rect.top < windowHeight && rect.bottom > 60;

      setBounds({
        left: rect.left,
        width: rect.width,
        show: isOverflowing && isVisibleOnScreen,
        scrollWidth: Math.max(scrollWidth, totalWidth || 0)
      });
    };

    updateBounds();
    const handleScrollResize = () => updateBounds();

    window.addEventListener('resize', handleScrollResize);
    window.addEventListener('scroll', handleScrollResize, true);

    const observer = new ResizeObserver(() => updateBounds());
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleScrollResize);
      window.removeEventListener('scroll', handleScrollResize, true);
      observer.disconnect();
    };
  }, [containerRef, totalWidth]);

  // Đồng bộ vị trí cuộn: Container Bảng -> Thanh cuộn cố định
  useEffect(() => {
    const containerEl = containerRef?.current;
    if (!containerEl) return;

    const handleContainerScroll = () => {
      if (isSyncing.current) return;
      isSyncing.current = true;
      if (scrollbarRef.current) {
        scrollbarRef.current.scrollLeft = containerEl.scrollLeft;
      }
      requestAnimationFrame(() => {
        isSyncing.current = false;
      });
    };

    containerEl.addEventListener('scroll', handleContainerScroll);
    return () => containerEl.removeEventListener('scroll', handleContainerScroll);
  }, [containerRef]);

  // Đồng bộ vị trí cuộn: Thanh cuộn cố định -> Container Bảng
  const handleFloatingScroll = () => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (containerRef.current && scrollbarRef.current) {
      containerRef.current.scrollLeft = scrollbarRef.current.scrollLeft;
    }
    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  };

  if (!bounds.show) return null;

  return (
    <div
      ref={scrollbarRef}
      onScroll={handleFloatingScroll}
      className="fixed-horizontal-scrollbar"
      style={{
        position: 'fixed',
        bottom: 0,
        left: `${bounds.left}px`,
        width: `${bounds.width}px`,
        height: '20px',
        overflowX: 'auto',
        overflowY: 'hidden',
        zIndex: 9999,
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(8px)',
        borderTop: '1.5px solid #3b82f6',
        boxShadow: '0 -4px 15px rgba(0, 0, 0, 0.15)',
        borderRadius: '8px 8px 0 0'
      }}
    >
      <div style={{ width: `${bounds.scrollWidth}px`, height: '1px' }} />
    </div>
  );
}
