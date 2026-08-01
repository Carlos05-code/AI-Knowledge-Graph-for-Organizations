import { AggregateRoot } from '@nestjs/cqrs';

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  VIEWER = 'VIEWER',
}

export interface UserProps {
  id?: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  title?: string;
  department?: string;
  keycloakId: string;
  organizationId: string;
  role?: UserRole;
  isActive?: boolean;
  preferences?: Record<string, unknown>;
  lastLoginAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export class User extends AggregateRoot {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly avatar?: string;
  readonly title?: string;
  readonly department?: string;
  readonly keycloakId: string;
  readonly organizationId: string;
  readonly role: UserRole;
  readonly isActive: boolean;
  readonly preferences: Record<string, unknown>;
  readonly lastLoginAt?: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt?: Date | null;

  constructor(props: UserProps) {
    super();
    this.id = props.id || crypto.randomUUID();
    this.email = props.email;
    this.firstName = props.firstName;
    this.lastName = props.lastName;
    this.avatar = props.avatar;
    this.title = props.title;
    this.department = props.department;
    this.keycloakId = props.keycloakId;
    this.organizationId = props.organizationId;
    this.role = props.role ?? UserRole.USER;
    this.isActive = props.isActive ?? true;
    this.preferences = props.preferences ?? {};
    this.lastLoginAt = props.lastLoginAt ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
    this.deletedAt = props.deletedAt ?? null;
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  isAdmin(): boolean {
    return this.role === UserRole.ADMIN;
  }
}
