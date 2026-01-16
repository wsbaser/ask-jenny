import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Palette, Moon, Sun } from 'lucide-react';
import { darkThemes, lightThemes, type Theme } from '@/config/theme-options';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import type { Project } from '@/lib/electron';

interface ProjectThemeSectionProps {
  project: Project;
}

export function ProjectThemeSection({ project }: ProjectThemeSectionProps) {
  const { theme: globalTheme, setProjectTheme } = useAppStore();
  const [activeTab, setActiveTab] = useState<'dark' | 'light'>('dark');

  const projectTheme = project.theme as Theme | undefined;
  const hasCustomTheme = projectTheme !== undefined;
  const effectiveTheme = projectTheme || globalTheme;

  const themesToShow = activeTab === 'dark' ? darkThemes : lightThemes;

  const handleThemeChange = (theme: Theme) => {
    setProjectTheme(project.id, theme);
  };

  const handleUseGlobalTheme = (checked: boolean) => {
    if (checked) {
      // Clear project theme to use global
      setProjectTheme(project.id, null);
    } else {
      // Set project theme to current global theme
      setProjectTheme(project.id, globalTheme);
    }
  };

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden',
        'border border-border/50',
        'bg-gradient-to-br from-card/90 via-card/70 to-card/80 backdrop-blur-xl',
        'shadow-sm shadow-black/5'
      )}
    >
      <div className="p-6 border-b border-border/50 bg-gradient-to-r from-transparent via-accent/5 to-transparent">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 flex items-center justify-center border border-brand-500/20">
            <Palette className="w-5 h-5 text-brand-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Theme</h2>
        </div>
        <p className="text-sm text-muted-foreground/80 ml-12">
          Customize the theme for this project.
        </p>
      </div>
      <div className="p-6 space-y-6">
        {/* Use Global Theme Toggle */}
        <div className="group flex items-start space-x-3 p-3 rounded-xl hover:bg-accent/30 transition-colors duration-200 -mx-3">
          <Checkbox
            id="use-global-theme"
            checked={!hasCustomTheme}
            onCheckedChange={handleUseGlobalTheme}
            className="mt-1"
            data-testid="use-global-theme-checkbox"
          />
          <div className="space-y-1.5">
            <Label
              htmlFor="use-global-theme"
              className="text-foreground cursor-pointer font-medium flex items-center gap-2"
            >
              <Palette className="w-4 h-4 text-brand-500" />
              Use Global Theme
            </Label>
            <p className="text-xs text-muted-foreground/80 leading-relaxed">
              When enabled, this project will use the global theme setting. Disable to set a
              project-specific theme.
            </p>
          </div>
        </div>

        {/* Theme Selection - only show if not using global theme */}
        {hasCustomTheme && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">Project Theme</Label>
              {/* Dark/Light Tabs */}
              <div className="flex gap-1 p-1 rounded-lg bg-accent/30">
                <button
                  onClick={() => setActiveTab('dark')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
                    activeTab === 'dark'
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Moon className="w-3.5 h-3.5" />
                  Dark
                </button>
                <button
                  onClick={() => setActiveTab('light')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
                    activeTab === 'light'
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Sun className="w-3.5 h-3.5" />
                  Light
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {themesToShow.map(({ value, label, Icon, testId, color }) => {
                const isActive = effectiveTheme === value;
                return (
                  <button
                    key={value}
                    onClick={() => handleThemeChange(value)}
                    className={cn(
                      'group flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl',
                      'text-sm font-medium transition-all duration-200 ease-out',
                      isActive
                        ? [
                            'bg-gradient-to-br from-brand-500/15 to-brand-600/10',
                            'border-2 border-brand-500/40',
                            'text-foreground',
                            'shadow-md shadow-brand-500/10',
                          ]
                        : [
                            'bg-accent/30 hover:bg-accent/50',
                            'border border-border/50 hover:border-border',
                            'text-muted-foreground hover:text-foreground',
                            'hover:shadow-sm',
                          ],
                      'hover:scale-[1.02] active:scale-[0.98]'
                    )}
                    data-testid={`project-${testId}`}
                  >
                    <Icon className="w-4 h-4 transition-all duration-200" style={{ color }} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Info when using global theme */}
        {!hasCustomTheme && (
          <div className="rounded-xl border border-border/30 bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              This project is using the global theme:{' '}
              <span className="font-medium text-foreground">{globalTheme}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
