/**
 * Update Settings Component
 * Displays update status and allows manual update checking/installation
 */
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useUpdateStore } from '@/stores/update';
import { useTranslation } from 'react-i18next';

export function UpdateSettings() {
  const { t } = useTranslation('settings');
  const {
    currentVersion,
    isInitialized,
    init,
  } = useUpdateStore();

  // Initialize on mount
  useEffect(() => {
    init();
  }, [init]);

  if (!isInitialized) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current Version */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('updates.currentVersion')}</p>
          <p className="text-2xl font-bold">v{currentVersion}</p>
        </div>
        {/* {renderStatusIcon()} */}
      </div>

      {/* Status */}
      {/* <div className="flex items-center justify-between py-3 border-t border-b">
        <p className="text-sm text-muted-foreground">{renderStatusText()}</p>
        {renderAction()}
      </div> */}

      {/* Download Progress */}
      {/* {status === 'downloading' && progress && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>
              {formatBytes(progress.transferred)} / {formatBytes(progress.total)}
            </span>
            <span>{formatBytes(progress.bytesPerSecond)}/s</span>
          </div>
          <Progress value={progress.percent} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">
            {Math.round(progress.percent)}% complete
          </p>
        </div>
      )} */}

      {/* Update Info */}
      {/* {updateInfo && (status === 'available' || status === 'downloaded') && (
        <div className="rounded-lg bg-muted p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-medium">Version {updateInfo.version}</p>
            {updateInfo.releaseDate && (
              <p className="text-sm text-muted-foreground">
                {new Date(updateInfo.releaseDate).toLocaleDateString()}
              </p>
            )}
          </div>
          {updateInfo.releaseNotes && (
            <div className="text-sm text-muted-foreground prose prose-sm max-w-none">
              <p className="font-medium text-foreground mb-1">{t('updates.whatsNew')}</p>
              <p className="whitespace-pre-wrap">{updateInfo.releaseNotes}</p>
            </div>
          )}
        </div>
      )} */}

      {/* Error Details */}
      {/* {status === 'error' && error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/10 p-4 text-red-600 dark:text-red-400 text-sm">
          <p className="font-medium mb-1">{t('updates.errorDetails')}</p>
          <p>{error}</p>
        </div>
      )} */}

      {/* Help Text */}
      {/* <p className="text-xs text-muted-foreground">{t('updates.help')}</p> */}
    </div>
  );
}

export default UpdateSettings;
