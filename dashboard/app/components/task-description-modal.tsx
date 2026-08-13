"use client";

import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from "@heroui/react";
import { MarkdownContent } from "./markdown-content";

interface TaskDescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
}

export function TaskDescriptionModal({
  isOpen,
  onClose,
  title,
  description,
}: TaskDescriptionModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="3xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        <ModalHeader style={{ fontSize: "1.1rem", fontWeight: 600 }}>
          {title}
        </ModalHeader>
        <ModalBody>
          <MarkdownContent content={description} />
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>
            Cerrar
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}