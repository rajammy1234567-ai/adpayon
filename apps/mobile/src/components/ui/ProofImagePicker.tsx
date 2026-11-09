import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon, Trash2, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { THEME } from '../../constants/theme';
import { uploadProofScreenshotApi, ProofUploadResponse } from '../../services/api/upload.api';

interface ProofImagePickerProps {
  onProofUploaded: (proof: ProofUploadResponse | null) => void;
  label?: string;
  helperText?: string;
  initialProofUrl?: string;
}

export const ProofImagePicker: React.FC<ProofImagePickerProps> = ({
  onProofUploaded,
  label = 'Upload Screenshot Proof',
  helperText = 'Attach clear screenshot proof of the completed action (JPEG, PNG or WebP, max 5MB).',
  initialProofUrl,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedProof, setUploadedProof] = useState<ProofUploadResponse | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(initialProofUrl || null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleNativePick = async () => {
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission Required',
          'Gallery access is needed to select and upload your completion screenshot.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setPreviewUri(asset.uri);
        setIsUploading(true);

        const data = await uploadProofScreenshotApi({
          uri: asset.uri,
          name: asset.fileName || 'screenshot.jpg',
          type: asset.mimeType || 'image/jpeg',
        });

        setUploadedProof(data);
        onProofUploaded(data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload screenshot. Please retry.');
      setPreviewUri(null);
      setUploadedProof(null);
      onProofUploaded(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleWebFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.size > 5 * 1024 * 1024) {
      setError('File size exceeds the 5MB limit. Please choose a smaller image.');
      return;
    }

    setError(null);
    const localUrl = URL.createObjectURL(file);
    setPreviewUri(localUrl);
    setIsUploading(true);

    try {
      const data = await uploadProofScreenshotApi(file);
      setUploadedProof(data);
      onProofUploaded(data);
    } catch (err: any) {
      setError(err.message || 'Failed to upload screenshot. Please retry.');
      setPreviewUri(null);
      setUploadedProof(null);
      onProofUploaded(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleTriggerPick = () => {
    if (Platform.OS === 'web') {
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    } else {
      handleNativePick();
    }
  };

  const handleRemove = () => {
    setPreviewUri(null);
    setUploadedProof(null);
    setError(null);
    onProofUploaded(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}

      {Platform.OS === 'web' && (
        <input
          ref={fileInputRef as any}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={handleWebFileSelect as any}
        />
      )}

      {previewUri ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
          <View style={styles.previewOverlay}>
            {isUploading ? (
              <View style={styles.uploadingBox}>
                <ActivityIndicator color={THEME.colors.primary} size="small" />
                <Text style={styles.uploadingText}>Verifying & Uploading...</Text>
              </View>
            ) : (
              <View style={styles.successRow}>
                <View style={styles.verifiedBadge}>
                  <CheckCircle2 size={16} color={THEME.colors.emerald} />
                  <Text style={styles.verifiedText}>Screenshot Verified</Text>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={handleRemove}
                  style={styles.removeBtn}
                >
                  <Trash2 size={16} color="#DC2626" />
                  <Text style={styles.removeText}>Change</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      ) : (
        <TouchableOpacity
          activeOpacity={0.8}
          accessibilityRole="button"
          onPress={handleTriggerPick}
          disabled={isUploading}
          style={styles.pickButton}
        >
          <View style={styles.iconCircle}>
            <ImageIcon size={22} color={THEME.colors.primary} />
          </View>
          <View style={styles.btnTextCol}>
            <Text style={styles.btnTitle}>Select Screenshot from Gallery</Text>
            <Text style={styles.btnSub}>PNG, JPG, WebP up to 5MB</Text>
          </View>
        </TouchableOpacity>
      )}

      {error ? (
        <View style={styles.errorBox}>
          <AlertCircle size={14} color={THEME.colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  helperText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginBottom: 10,
    lineHeight: 18,
  },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnTextCol: {
    flex: 1,
  },
  btnTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  btnSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  previewContainer: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
  },
  previewImage: {
    width: '100%',
    height: 220,
    backgroundColor: '#020617',
  },
  previewOverlay: {
    padding: 12,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  uploadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  uploadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.primary,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  verifiedText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.emerald,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  removeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
  },
  errorText: {
    fontSize: 12,
    color: THEME.colors.danger,
    flex: 1,
  },
});

