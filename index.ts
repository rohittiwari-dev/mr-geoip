import {
  getIpDetails,
  initIpDatabases,
  type IpDetails,
} from "./lib/ipLocation";
import updateDb from "./lib/update";

await initIpDatabases();

export type LOOKUP = IpDetails;
export const lookup = getIpDetails;
export { updateDb };
