export class RateLimiter {
  /**
   * Generates a random delay between min and max seconds
   */
  public static async randomDelay(min: number, max: number, onTick?: (seconds: number) => void): Promise<void> {
    const ms = Math.floor(Math.random() * (max - min + 1) + min) * 1000;
    const seconds = Math.floor(ms / 1000);
    
    for (let i = seconds; i > 0; i--) {
      if (onTick) onTick(i);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Pause for a longer duration
   */
  public static async pause(minMinutes: number, maxMinutes: number, onTick?: (remainingSeconds: number) => void): Promise<void> {
    const minutes = Math.random() * (maxMinutes - minMinutes) + minMinutes;
    const totalSeconds = Math.floor(minutes * 60);
    
    for (let i = totalSeconds; i > 0; i--) {
      if (onTick) onTick(i);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
