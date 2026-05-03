import { useAuth } from '../lib/AuthContext';
import { ACHIEVEMENTS } from '../lib/achievements';

export default function Achievements() {
  const { profile } = useAuth();
  if (!profile) return null;
  const unlocked = profile.unlockedAchievements || [];
  const progress = Math.round((unlocked.length / ACHIEVEMENTS.length) * 100);

  return (
    <div className="fade-in space-y-8">
      <section>
        <div className="font-mono text-[0.65rem] tracking-widest uppercase opacity-50 mb-2">
          {unlocked.length} of {ACHIEVEMENTS.length} unlocked
        </div>
        <h1 className="font-display text-4xl font-medium tracking-tight">Achievements</h1>
        <div className="mt-4 h-1 w-full max-w-md" style={{ background: 'var(--hairline)' }}>
          <div className="h-full transition-all duration-500" style={{ width: `${progress}%`, background: 'var(--ink)' }} />
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ACHIEVEMENTS.map(a => {
          const got = unlocked.includes(a.id);
          return (
            <div key={a.id} className="border hairline p-4 transition-all" style={{ opacity: got ? 1 : 0.4 }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display text-lg font-medium">{a.name}</div>
                  <div className="font-mono text-[0.7rem] tracking-wide opacity-70 mt-1 leading-relaxed">{a.desc}</div>
                </div>
                {got && (
                  <div className="font-mono text-[0.6rem] tracking-widest uppercase shrink-0" style={{ color: 'var(--forest)' }}>
                    ✓ DONE
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
