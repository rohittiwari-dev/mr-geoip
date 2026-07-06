import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { join } from "node:path";
import { Reader } from "@maxmind/geoip2-node";

type ReaderModel = Awaited<ReturnType<typeof Reader.open>>;

export type IpDetails = {
  ip: string;
  country: string | null;
  countryCode: string | null;
  subdivision: string | null;
  subdivisionCode: string | null;
  continent: string | null;
  continentCode: string | null;
  city: string | null;
  postalCode: string | null;
  euMember: boolean | null;
  timezone: string | null;
  cordinates: { latitude: number; longitude: number } | null;
  asn: number | null;
  organization: string | null;
  network: string | null;
  traits: {
    isAnonymous: boolean;
    isAnonymousProxy: boolean;
    isAnonymousVpn: boolean;
    isHostingProvider: boolean;
    isLegitimateProxy: boolean;
    isPublicProxy: boolean;
    isResidentialProxy: boolean;
    isSatelliteProvider: boolean;
    isTorExitNode: boolean;
    isAnycast: boolean;
  } | null;
};

let cityReader: ReaderModel | null = null;
let asnReader: ReaderModel | null = null;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.R_OK);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function initIpDatabases(dataDir = "data") {
  if (cityReader) {
    return { cityReader, asnReader };
  }

  const cityDbPath = join(process.cwd(), dataDir, "GeoLite2-City.mmdb");
  const asnDbPath = join(process.cwd(), dataDir, "GeoLite2-ASN.mmdb");

  cityReader = await Reader.open(cityDbPath);

  if (await exists(asnDbPath)) {
    asnReader = await Reader.open(asnDbPath);
  }

  return { cityReader, asnReader };
}

export function getIpDetails(ip: string): IpDetails {
  if (!cityReader) {
    throw new Error(
      "IP database not initialized. Call initIpDatabases() first.",
    );
  }

  const city = cityReader.city(ip);
  const asn = asnReader ? asnReader.asn(ip) : null;

  const regionName = city.subdivisions?.[0]?.names?.en ?? null;

  return {
    ip,
    country: city.country?.names?.en ?? null,
    countryCode: city.country?.isoCode ?? null,
    subdivision: regionName,
    subdivisionCode: city.subdivisions?.[0]?.isoCode ?? null,
    continent: city.continent?.names?.en ?? null,
    continentCode: city.continent?.code ?? null,
    city: city.city?.names?.en ?? null,
    postalCode: city.postal?.code ?? null,
    euMember: city.registeredCountry?.isInEuropeanUnion ?? null,
    timezone: city.location?.timeZone ?? null,
    cordinates:
      city.location && city.location.latitude && city.location.longitude
        ? {
            latitude: city.location.latitude,
            longitude: city.location.longitude,
          }
        : null,
    asn: asn?.autonomousSystemNumber ?? null,
    organization: asn?.autonomousSystemOrganization ?? null,
    network: asn?.network?.toString() ?? null,
    traits: {
      isAnonymous: city.traits?.isAnonymous ?? false,
      isAnonymousProxy: city.traits?.isAnonymousProxy ?? false,
      isAnonymousVpn: city.traits?.isAnonymousVpn ?? false,
      isHostingProvider: city.traits?.isHostingProvider ?? false,
      isLegitimateProxy: city.traits?.isLegitimateProxy ?? false,
      isPublicProxy: city.traits?.isPublicProxy ?? false,
      isResidentialProxy: city.traits?.isResidentialProxy ?? false,
      isSatelliteProvider: city.traits?.isSatelliteProvider ?? false,
      isTorExitNode: city.traits?.isTorExitNode ?? false,
      isAnycast: city.traits?.isAnycast ?? false,
    },
  };
}
