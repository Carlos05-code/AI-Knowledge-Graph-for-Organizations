import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const org = await prisma.organization.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      id: crypto.randomUUID(),
      name: 'Acme Corporation',
      slug: 'acme-corp',
      domain: 'acme.com',
    },
  });

  const adminPassword = await bcrypt.hash('admin123', 12);
  const userPassword = await bcrypt.hash('user123', 12);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@acme.com' },
    update: {},
    create: {
      id: crypto.randomUUID(),
      email: 'admin@acme.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      keycloakId: crypto.randomUUID(),
      organizationId: org.id,
      role: 'ADMIN',
    },
  });

  const regularUser = await prisma.user.upsert({
    where: { email: 'john@acme.com' },
    update: {},
    create: {
      id: crypto.randomUUID(),
      email: 'john@acme.com',
      password: userPassword,
      firstName: 'John',
      lastName: 'Doe',
      keycloakId: crypto.randomUUID(),
      organizationId: org.id,
      role: 'USER',
    },
  });

  const paymentApiDoc = await prisma.document.create({
    data: {
      id: crypto.randomUUID(),
      title: 'Payment API Documentation',
      description: 'Complete documentation for the Payment API service including authentication, endpoints, and deployment.',
      filePath: '/docs/payment-api.md',
      fileType: 'md',
      fileSize: 24576,
      mimeType: 'text/markdown',
      checksum: crypto.createHash('sha256').update('payment-api-doc').digest('hex'),
      status: 'INDEXED',
      isIndexed: true,
      organizationId: org.id,
      authorId: adminUser.id,
      source: 'UPLOAD',
    },
  });

  const k8sGuide = await prisma.document.create({
    data: {
      id: crypto.randomUUID(),
      title: 'Kubernetes Deployment Guide',
      description: 'How to deploy microservices to our Kubernetes cluster on AWS EKS.',
      filePath: '/docs/k8s-deploy.md',
      fileType: 'md',
      fileSize: 18432,
      mimeType: 'text/markdown',
      checksum: crypto.createHash('sha256').update('k8s-guide').digest('hex'),
      status: 'INDEXED',
      isIndexed: true,
      organizationId: org.id,
      authorId: regularUser.id,
      source: 'CONFLUENCE',
    },
  });

  await prisma.chunk.createMany({
    data: [
      {
        id: `${paymentApiDoc.id}_chunk_0`,
        documentId: paymentApiDoc.id,
        content: 'The Payment API provides RESTful endpoints for processing payments. Authentication is done via API keys passed in the Authorization header.',
        index: 0,
        tokenCount: 20,
      },
      {
        id: `${paymentApiDoc.id}_chunk_1`,
        documentId: paymentApiDoc.id,
        content: 'Deployment: The Payment API runs on Kubernetes in the payments namespace. Use \`kubectl apply -f k8s/payment-api/\` to deploy.',
        index: 1,
        tokenCount: 22,
      },
      {
        id: `${k8sGuide.id}_chunk_0`,
        documentId: k8sGuide.id,
        content: 'Our Kubernetes cluster runs on AWS EKS version 1.28. Nodes are managed by EC2 auto-scaling groups across 3 availability zones.',
        index: 0,
        tokenCount: 22,
      },
    ],
  });

  const conversation = await prisma.conversation.create({
    data: {
      id: crypto.randomUUID(),
      title: 'How to deploy Payment API?',
      userId: regularUser.id,
    },
  });

  await prisma.message.createMany({
    data: [
      { conversationId: conversation.id, role: 'USER', content: 'How do I deploy the Payment API?' },
      { conversationId: conversation.id, role: 'ASSISTANT', content: 'To deploy the Payment API, use \`kubectl apply -f k8s/payment-api/\` in the payments namespace. Make sure you have the correct kubeconfig for our EKS cluster.', sources: [{ title: 'Payment API Documentation', id: paymentApiDoc.id, type: 'document' }] as any, confidence: 0.92 },
    ],
  });

  const meeting = await prisma.meeting.create({
    data: {
      id: crypto.randomUUID(),
      title: 'Sprint Review — Week 32',
      description: 'Weekly sprint review and planning',
      meetingDate: new Date(),
      duration: 3600,
      summary: 'Reviewed Payment API progress, discussed Kubernetes migration, planned Q3 roadmap.',
      actionItems: ['Update Payment API documentation', 'Schedule K8s migration workshop'],
      decisions: ['Postpone micro-frontend migration to Q4'],
      organizerId: adminUser.id,
      organizationId: org.id,
    },
  });

  await prisma.policy.create({
    data: {
      id: crypto.randomUUID(),
      title: 'Remote Work Policy',
      content: 'Employees may work remotely up to 3 days per week. Contractors must work on-site. All remote work requires manager approval.',
      version: 2,
      category: 'HR',
      organizationId: org.id,
      isActive: true,
    },
  });

  await prisma.notification.create({
    data: {
      userId: adminUser.id,
      type: 'DOCUMENT_CHANGED',
      title: 'Welcome to AI Knowledge Graph',
      message: 'Your knowledge graph is ready. Start by connecting data sources or uploading documents.',
    },
  });

  await prisma.expertiseScore.createMany({
    data: [
      { userId: adminUser.id, topic: 'Kubernetes', score: 0.95, source: 'commits' },
      { userId: adminUser.id, topic: 'Payment Systems', score: 0.88, source: 'documents' },
      { userId: regularUser.id, topic: 'Frontend', score: 0.85, source: 'documents' },
      { userId: regularUser.id, topic: 'React', score: 0.92, source: 'pull_requests' },
    ],
  });

  await prisma.knowledgeGap.create({
    data: {
      title: 'Payment API undocumented endpoints',
      description: 'The /v2/refund endpoint is not documented in the Payment API docs',
      severity: 'HIGH',
      category: 'documentation',
    },
  });

  console.log('Seed completed successfully');
  console.log(`  Organization: ${org.name}`);
  console.log(`  Users: ${[adminUser.email, regularUser.email].join(', ')}`);
  console.log(`  Documents: ${[paymentApiDoc.title, k8sGuide.title].join(', ')}`);
  console.log(`  Meetings: ${meeting.title}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
