export interface Filters {
    country?: string | null;
    gender?: string | null;
    age?: string | null | number;
    isStrict?: boolean;
}

export interface UserDetails {
    country?: string | null;
    gender?: string | null;
    age?: string | null | number;
}

export interface UserPref {
    pref_country?: string | null;
    pref_gender?: string | null;
    pref_age?: number | null | string;
    isStrict?: boolean;
}

export interface UserMetaData extends UserDetails, UserPref { }