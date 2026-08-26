import us from '../assets/flags/us.png';
import ca from '../assets/flags/ca.png';
import gb from '../assets/flags/gb.png';
import de from '../assets/flags/de.png';
import fr from '../assets/flags/fr.png';
import it from '../assets/flags/it.png';
import jp from '../assets/flags/jp.png';
import cn from '../assets/flags/cn.png';
import au from '../assets/flags/au.png';
import nz from '../assets/flags/nz.png';
import ch from '../assets/flags/ch.png';
import inFlag from '../assets/flags/in.png'; // `in` is reserved-ish; name the import
import kr from '../assets/flags/kr.png';
import eu from '../assets/flags/eu.png';     // if you added it
import globe from '../assets/flags/globe.png'; // optional

const FLAG_IMG: Record<string, string> = {
  US: us,
  CA: ca,
  GB: gb,
  UK: gb,
  DE: de,
  FR: fr,
  IT: it,
  JP: jp,
  CN: cn,
  AU: au,
  NZ: nz,
  CH: ch,
  IN: inFlag,
  KR: kr,
  EU: eu,
  EMU: eu,
  ALL: globe,
};

/** Image src for <img> — works on Windows (no emoji). */
export function getCountryFlagSrc(code: string): string | undefined {
  return FLAG_IMG[code.toUpperCase()];
}

/** Optional emoji fallback (macOS/Linux). */
export function getCountryFlagEmoji(code: string): string {
  const map: Record<string, string> = {
    US: '🇺🇸', CA: '🇨🇦', GB: '🇬🇧', EU: '🇪🇺', DE: '🇩🇪',
    FR: '🇫🇷', IT: '🇮🇹', JP: '🇯🇵', CN: '🇨🇳', AU: '🇦🇺',
    NZ: '🇳🇿', CH: '🇨🇭', IN: '🇮🇳', KR: '🇰🇷', ALL: '🌍',
  };
  return map[code.toUpperCase()] ?? '🏳️';
}