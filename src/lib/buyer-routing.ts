export interface BuyerDeliveryAddress {
  label?: string;
  formatted_address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  lat?: number;
  lng?: number;
}

function trimText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function deriveBuyerPlaceOfSupply(address: BuyerDeliveryAddress | null | undefined): string {
  return trimText(address?.label)
    || trimText(address?.city)
    || trimText(address?.state)
    || 'Unknown';
}

export function hasBuyerDeliveryCoordinates(address: BuyerDeliveryAddress | null | undefined): address is Required<Pick<BuyerDeliveryAddress, 'lat' | 'lng'>> & BuyerDeliveryAddress {
  return Boolean(address)
    && typeof address?.lat === 'number'
    && Number.isFinite(address.lat)
    && typeof address?.lng === 'number'
    && Number.isFinite(address.lng);
}
