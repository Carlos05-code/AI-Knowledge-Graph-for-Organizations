import { AggregateRoot } from '@nestjs/cqrs';

export interface OrganizationProps {
  id?: string;
  name: string;
  slug: string;
  domain?: string;
  logo?: string;
  settings?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export class Organization extends AggregateRoot {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly domain?: string;
  readonly logo?: string;
  readonly settings: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt?: Date | null;

  constructor(props: OrganizationProps) {
    super();
    this.id = props.id || crypto.randomUUID();
    this.name = props.name;
    this.slug = props.slug;
    this.domain = props.domain;
    this.logo = props.logo;
    this.settings = props.settings ?? {};
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
    this.deletedAt = props.deletedAt ?? null;
  }
}
