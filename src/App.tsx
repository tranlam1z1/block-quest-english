// ============================================================
// Khung ứng dụng: điều hướng giữa các màn hình + quản lý nhạc nền
// ============================================================
import { Suspense, lazy, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { setSfxEnabled, startMusic, stopMusic } from './services/audio';
import { useSettings } from './stores/settings';
import { HomePage } from './features/home/HomePage';
import { SelectPage } from './features/select/SelectPage';
import { MapPage } from './features/map/MapPage';
import { BattlePage } from './features/battle/BattlePage';
import { CollectionPage } from './features/collection/CollectionPage';
import { ShopPage } from './features/shop/ShopPage';
import { DuelSetupPage } from './features/duel/DuelSetupPage';
import { DuelPage } from './features/duel/DuelPage';
import { LeaderboardPage } from './features/leaderboard/LeaderboardPage';
import { PvpHomePage } from './features/pvp/PvpHomePage';
import { RoomPage } from './features/pvp/RoomPage';
import { ClassPage } from './features/class/ClassPage';
import { HomeworkListPage, HomeworkPage } from './features/homework/HomeworkPage';
import { ParentPage } from './features/parent/ParentPage';
import { loadContent } from './content';
import { startResultSync } from './services/results';
import { useHomework } from './services/homework';

// Khu vực giáo viên tải riêng (có thư viện Excel), học sinh không phải tải
const TeacherApp = lazy(() => import('./features/teacher/TeacherApp').then((m) => ({ default: m.TeacherApp })));

/** Bật/tắt nhạc nền & hiệu ứng theo cài đặt. Nhạc chỉ phát sau lần chạm đầu tiên (quy định trình duyệt). */
function AudioManager() {
  const musicOn = useSettings((s) => s.musicOn);
  const sfxOn = useSettings((s) => s.sfxOn);

  useEffect(() => setSfxEnabled(sfxOn), [sfxOn]);

  useEffect(() => {
    if (!musicOn) {
      stopMusic();
      return;
    }
    const start = () => startMusic();
    // Thử phát ngay (được nếu người dùng đã chạm), đồng thời chờ lần chạm tiếp theo
    start();
    window.addEventListener('pointerdown', start, { once: true });
    return () => window.removeEventListener('pointerdown', start);
  }, [musicOn]);

  // Tạm dừng nhạc khi chuyển tab / tắt màn hình
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) stopMusic();
      else if (useSettings.getState().musicOn) startMusic();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return null;
}

export function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Nạp nội dung giáo viên đã sửa trước khi hiện game
    loadContent().finally(() => setReady(true));
    startResultSync();
    // Tải bài tập về nhà mới (không có mạng thì dùng bản đã lưu)
    void useHomework.getState().refresh();
  }, []);

  if (!ready) return <div className="h-[100dvh] grid place-items-center text-2xl font-extrabold text-sky-800">Đang tải…</div>;

  return (
    <HashRouter>
      <AudioManager />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/select" element={<SelectPage />} />
        <Route path="/map/:unitId" element={<MapPage />} />
        <Route path="/battle/:unitId/:stage" element={<BattlePage />} />
        <Route path="/collection" element={<CollectionPage />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/duel" element={<DuelSetupPage />} />
        <Route path="/duel/:unitId/:bot" element={<DuelPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/pvp" element={<PvpHomePage />} />
        <Route path="/pvp/room/:code" element={<RoomPage />} />
        <Route path="/class" element={<ClassPage />} />
        <Route path="/class/:code" element={<ClassPage />} />
        <Route path="/homework" element={<HomeworkListPage />} />
        <Route path="/homework/:id" element={<HomeworkPage />} />
        <Route path="/parent" element={<ParentPage />} />
        <Route
          path="/teacher/*"
          element={
            <Suspense fallback={<div className="p-8 text-center font-bold text-sky-800">Đang tải…</div>}>
              <TeacherApp />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
