import com.android.apksig.ApkVerifier;
import com.android.apksig.SigningCertificateLineage;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.util.HexFormat;
import java.util.List;

// Read public signature metadata using the selected SDK's apksigner.jar. No keys/passwords.
class AndroidReleaseInspector {
    private static String digest(byte[] bytes) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 3 && args[0].equals("--prepare-lineage")) {
            SigningCertificateLineage lineage = SigningCertificateLineage.readFromFile(new File(args[1]));
            List<X509Certificate> certificates = lineage.getCertificatesInLineage();
            if (certificates.size() != 2 ||
                !digest(certificates.get(0).getEncoded()).equals("8ef9a804043c411f136d716da23d13e1e0c50f9f024a84acc1a5738065fa051b") ||
                !digest(certificates.get(1).getEncoded()).equals("f082252c0506cc50af35ff7cb5bc4e7e77136a8c2b5befb6609f35a5fa83d805")) {
                throw new IllegalStateException("Unexpected release signing lineage");
            }
            // The exposed predecessor may transfer existing data, but gains no other trust.
            lineage.updateSignerCapabilities(certificates.get(0),
                new SigningCertificateLineage.SignerCapabilities.Builder()
                    .setInstalledData(true).setRollback(false).setSharedUid(false)
                    .setPermission(false).setAuth(false).build());
            Files.write(new File(args[2]).toPath(), lineage.getBytes(),
                StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
            System.out.println("Prepared data-only signing transition; source lineage preserved");
            return;
        }
        if (args.length != 1) throw new IllegalArgumentException("Expected one signed APK path");
        File apk = new File(args[0]);
        ApkVerifier.Result result = new ApkVerifier.Builder(apk).build().verify();
        if (!result.isVerified() || !result.getWarnings().isEmpty()) {
            throw new IllegalStateException("APK signature failed verification or has warnings");
        }
        List<X509Certificate> signers = result.getSignerCertificates();
        StringBuilder json = new StringBuilder("{\"schemaVersion\":1,\"verified\":true,\"sha256\":\"");
        json.append(digest(Files.readAllBytes(apk.toPath()))).append("\",\"v3\":")
            .append(result.isVerifiedUsingV3Scheme()).append(",\"signers\":[");
        for (int i = 0; i < signers.size(); i++) {
            if (i != 0) json.append(',');
            json.append('"').append(digest(signers.get(i).getEncoded())).append('"');
        }
        json.append("],\"lineage\":[");
        SigningCertificateLineage lineage = result.getSigningCertificateLineage();
        if (lineage != null) {
            List<X509Certificate> certificates = lineage.getCertificatesInLineage();
            for (int i = 0; i < certificates.size(); i++) {
                if (i != 0) json.append(',');
                X509Certificate certificate = certificates.get(i);
                SigningCertificateLineage.SignerCapabilities capabilities = lineage.getSignerCapabilities(certificate);
                json.append("{\"sha256\":\"").append(digest(certificate.getEncoded()))
                    .append("\",\"installedData\":").append(capabilities.hasInstalledData())
                    .append(",\"rollback\":").append(capabilities.hasRollback())
                    .append(",\"sharedUid\":").append(capabilities.hasSharedUid())
                    .append(",\"permission\":").append(capabilities.hasPermission())
                    .append(",\"auth\":").append(capabilities.hasAuth()).append('}');
            }
        }
        System.out.println(json.append("]}"));
    }
}
